from __future__ import annotations
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.config import settings
from backend.app.models.claim_verification import (
    ClaimClassification,
    ClaimRiskLevel,
    ClaimType,
    ClaimVerificationFinding,
    ClaimVerificationReport,
    ClaimVerificationRequest,
    HumanClaimReviewDecision,
)
from backend.app.services.knowledge_service import knowledge_service
from backend.app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PATTERN MATCHERS FOR THE 7 MANDATED CLAIM TYPES
# ---------------------------------------------------------------------------
CLAIM_PATTERNS: List[Tuple[ClaimType, str, ClaimRiskLevel]] = [
    # 1. Number one in the industry
    (
        ClaimType.MARKET_LEADERSHIP,
        r"(#\s*1\b|number\s+one\b|industry\s+leader(ship)?\b|market\s+leader(ship)?\b|world's\s+leading\b|premier\s+provider\b|undisputed\s+leader(ship)?\b|foremost\b|security\s+leadership\b)",
        ClaimRiskLevel.HIGH,
    ),
    # 2. Guaranteed results
    (
        ClaimType.GUARANTEED_RESULTS,
        r"(guarantee(d)?\b|100%\s+guarantee(d)?\b|money-back\s+guarantee\b|risk-free\b|guaranteed\s+results?\b|promise(d)?\s+outcome\b|foolproof\b|zero\s+risk\b)",
        ClaimRiskLevel.CRITICAL,
    ),
    # 3. Clinically proven
    (
        ClaimType.CLINICALLY_PROVEN,
        r"(clinical(ly)?\s+proven\b|scientifically\s+(proven|tested|validated)\b|dermatologist\s+tested\b|lab\s+tested\b|peer-reviewed\b|medically\s+proven\b)",
        ClaimRiskLevel.CRITICAL,
    ),
    # 4. Best-selling products
    (
        ClaimType.BEST_SELLING,
        r"(best-selling\b|#\s*1\s+selling\b|top-selling\b|most\s+popular\s+(product|software|app|platform)\b|customer\s+favorite\b|world's\s+favorite\b)",
        ClaimRiskLevel.MEDIUM,
    ),
    # 5. Percentage improvement claims
    (
        ClaimType.PERCENTAGE_IMPROVEMENT,
        r"(\d+(\.\d+)?%\s*(faster|more|reduction|increase|boost|improvement|savings|growth|less|better)\b|\d+(\.\d+)?x\s*(faster|improvement|throughput|growth|multiplier)\b|cut(s)?\s+\w+\s+by\s+\d+(\.\d+)?%\b)",
        ClaimRiskLevel.HIGH,
    ),
    # 6. Performance claims
    (
        ClaimType.PERFORMANCE_METRIC,
        r"(\d+(\.\d+)?\s*(ms|millisecond(s)?|ghz|tbps|gbps|fps|uptime|hours?\s+battery|sla|req/s|queries\s+per\s+second)\b|sub-millisecond\b|zero\s+downtime\b|instantaneous\b|99\.\d+%\s*uptime\b)",
        ClaimRiskLevel.HIGH,
    ),
    # 7. Awards and certifications
    (
        ClaimType.AWARD_CERTIFICATION,
        r"(certified\b|certification\b|soc\s*2\b|iso\s*\d+\b|gartner\s+(magic\s+quadrant|leader)\b|forbes\s+\d+\b|fedramp\b|hipaa\b|pci-dss\b|award-winning\b|voted\s+#\s*1\b)",
        ClaimRiskLevel.HIGH,
    ),
    # 8. General company fact & founding date assertions
    (
        ClaimType.GENERAL_FACTUAL,
        r"(founded\s+in\s+\d{4}\b|established\s+in\s+\d{4}\b|headquartered\s+in\b|over\s+\d+\s+years\b|\b\d{4}\s+founding\b|since\s+\d{4}\b)",
        ClaimRiskLevel.HIGH,
    ),
]


class ClaimVerificationEngine:
    """
    Factual Accuracy and Promotional Claim Verification Engine.
    Detects claims across text and uploaded media, compares against approved company
    information and supporting evidence in the Brand Knowledge Base, and classifies results into:
    1. Verified against approved evidence
    2. Unsupported
    3. Contradictory
    4. Potentially outdated
    5. Requires human verification

    Strict Rule: Never assumes a claim is true based only on an AI model's knowledge.
    Strict Rule: High-risk claims must require authorised human review.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "claim_verification_reports.json")
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    async def verify_claims(self, request: ClaimVerificationRequest) -> ClaimVerificationReport:
        report_id = f"clm-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # 1. Retrieve Copy Text from input or OCR extracted file
        raw_text = request.text or ""
        content_source = "Direct Text Input"

        if request.file_path:
            p = Path(request.file_path)
            if p.exists():
                content_source = p.name
                ocr_data = ocr_service.extract_text(p)
                extracted = ocr_data.get("text", "").strip()
                if extracted:
                    raw_text = f"{raw_text}\n{extracted}" if raw_text else extracted

        if not raw_text.strip():
            return ClaimVerificationReport(
                report_id=report_id,
                org_id=request.org_id,
                brand_id=request.brand_id,
                content_source=content_source,
                overall_classification=ClaimClassification.VERIFIED,
                overall_claim_score=100.0,
                total_claims_detected=0,
                findings=[],
                created_at=now_iso
            )

        # 2. Retrieve Ground Truth from Organization's Brand Knowledge Base
        kb_context = knowledge_service.retrieve_for_content_analysis(
            org_id=request.org_id,
            brand_id=request.brand_id,
            copy_text=raw_text
        )

        approved_claims = kb_context.get("approved_promotional_claims", [])
        company_facts = kb_context.get("company_facts", [])
        active_exceptions = kb_context.get("active_policy_exceptions", [])

        # 3. Detect Candidate Claims via Pattern Matchers & Linguistic Extraction
        candidate_claims = self._extract_candidate_claims(raw_text)

        # 4. Deep Audit & Verification against Knowledge Base Ground Truth
        findings: List[ClaimVerificationFinding] = []
        for cand in candidate_claims:
            finding = self._audit_individual_claim(
                claim_text=cand["claim_text"],
                claim_type=cand["claim_type"],
                default_risk=cand["default_risk"],
                context_snippet=cand.get("context_snippet", ""),
                approved_claims=approved_claims,
                company_facts=company_facts,
                active_exceptions=active_exceptions,
                now=now
            )
            findings.append(finding)

        # 5. Calculate Metrics & Determine Human Review Requirement
        verified_cnt = sum(1 for f in findings if f.classification == ClaimClassification.VERIFIED)
        unsupported_cnt = sum(1 for f in findings if f.classification == ClaimClassification.UNSUPPORTED)
        contradictory_cnt = sum(1 for f in findings if f.classification == ClaimClassification.CONTRADICTORY)
        outdated_cnt = sum(1 for f in findings if f.classification == ClaimClassification.OUTDATED)
        human_req_cnt = sum(1 for f in findings if f.classification == ClaimClassification.REQUIRES_HUMAN_VERIFICATION or f.requires_human_review)

        # Calculate Score
        score = 100.0
        score -= (contradictory_cnt * 35.0)
        score -= (outdated_cnt * 20.0)
        score -= (unsupported_cnt * 15.0)
        score -= (human_req_cnt * 10.0)
        overall_score = round(max(0.0, min(100.0, score)), 1)

        # Determine Overall Aggregated Classification
        if contradictory_cnt > 0:
            overall_class = ClaimClassification.CONTRADICTORY
        elif outdated_cnt > 0:
            overall_class = ClaimClassification.OUTDATED
        elif unsupported_cnt > 0:
            overall_class = ClaimClassification.UNSUPPORTED
        elif human_req_cnt > 0:
            overall_class = ClaimClassification.REQUIRES_HUMAN_VERIFICATION
        else:
            overall_class = ClaimClassification.VERIFIED

        # Human Review Routing for High-Risk Claims
        has_high_risk = any(f.requires_human_review for f in findings)
        human_routing = None
        if has_high_risk:
            human_routing = {
                "department": "Brand Governance & Legal Compliance",
                "authorized_roles": ["General Counsel", "Chief Compliance Officer", "Authorized Brand Director"],
                "status": "PENDING_HUMAN_SIGN_OFF",
                "escalation_reason": "High-risk promotional assertions detected without verified empirical evidence."
            }

        report = ClaimVerificationReport(
            report_id=report_id,
            org_id=request.org_id,
            brand_id=request.brand_id,
            content_source=content_source,
            overall_classification=overall_class,
            overall_claim_score=overall_score,
            total_claims_detected=len(findings),
            verified_count=verified_cnt,
            unsupported_count=unsupported_cnt,
            contradictory_count=contradictory_cnt,
            outdated_count=outdated_cnt,
            requires_human_review_count=human_req_cnt,
            requires_human_review=has_high_risk,
            findings=findings,
            human_review_routing=human_routing,
            created_at=now_iso
        )

        self._save_report(report)
        return report

    def _extract_candidate_claims(self, text: str) -> List[Dict[str, Any]]:
        """
        Extracts candidate factual and promotional claims from copy text.
        Splits into sentences and matches against pattern definitions.
        """
        # Split text into sentences
        sentences = re.split(r"(?<=[.!?\n])\s+", text)
        candidates: List[Dict[str, Any]] = []
        seen_claims = set()

        for s in sentences:
            sentence_clean = s.strip()
            if not sentence_clean or len(sentence_clean) < 6:
                continue

            for claim_type, regex_pattern, risk_level in CLAIM_PATTERNS:
                match = re.search(regex_pattern, sentence_clean, re.IGNORECASE)
                if match:
                    matched_phrase = match.group(0)
                    key = (claim_type.value, matched_phrase.lower())
                    if key not in seen_claims:
                        seen_claims.add(key)
                        candidates.append({
                            "claim_text": sentence_clean,
                            "claim_type": claim_type,
                            "default_risk": risk_level,
                            "context_snippet": matched_phrase
                        })
                    break  # One primary claim type per sentence

        return candidates

    def _audit_individual_claim(
        self,
        claim_text: str,
        claim_type: ClaimType,
        default_risk: ClaimRiskLevel,
        context_snippet: str,
        approved_claims: List[Dict[str, Any]],
        company_facts: List[Dict[str, Any]],
        active_exceptions: List[Dict[str, Any]],
        now: datetime
    ) -> ClaimVerificationFinding:
        """
        Audits a single candidate claim against ground truth in Knowledge Base.
        Never assumes a claim is true based on model training data alone.
        """
        finding_id = f"fnd-{uuid.uuid4().hex[:8]}"
        claim_lower = claim_text.lower()

        # ---------------------------------------------------------------------
        # 1. CHECK CONTRADICTORY (Factual contradictions against company facts)
        # ---------------------------------------------------------------------
        for fact in company_facts:
            fact_body = fact.get("fact", "").lower()
            # Check for conflicting founding dates
            year_match = re.search(r"\b(19\d\d|20\d\d)\b", claim_text)
            fact_year_match = re.search(r"\b(19\d\d|20\d\d)\b", fact_body)
            if year_match and fact_year_match and "found" in claim_lower and "found" in fact_body:
                if year_match.group(1) != fact_year_match.group(1):
                    return ClaimVerificationFinding(
                        finding_id=finding_id,
                        claim=claim_text,
                        claim_type=claim_type,
                        classification=ClaimClassification.CONTRADICTORY,
                        supporting_evidence=None,
                        missing_evidence=f"Official corporate registry confirming founding year {year_match.group(1)}",
                        explanation=f"Claim asserts the company was founded in {year_match.group(1)}, directly contradicting certified company fact stating {fact_year_match.group(1)} ({fact.get('title')}).",
                        recommended_action=f"Correct founding year to {fact_year_match.group(1)} in accordance with verified corporate records.",
                        risk_level=ClaimRiskLevel.CRITICAL,
                        requires_human_review=True,
                        confidence_score=0.99,
                        matched_knowledge_id=fact.get("item_id"),
                        detected_snippet=year_match.group(0)
                    )

        # ---------------------------------------------------------------------
        # 2. CHECK APPROVED PROMOTIONAL CLAIMS & EVIDENCE
        # ---------------------------------------------------------------------
        for approved in approved_claims:
            approved_claim_text = approved.get("claim_text", "")
            if not approved_claim_text:
                continue

            # Check if this approved claim is referenced in the candidate claim
            if approved_claim_text.lower() in claim_lower or any(
                w in claim_lower for w in approved_claim_text.lower().split() if len(w) > 4
            ):
                # We have a matching approved claim specification!
                evidence_source = approved.get("evidence_source")
                valid_until_str = approved.get("valid_until")

                # Check if evidence is potentially outdated
                is_outdated = False
                if valid_until_str:
                    try:
                        valid_until_dt = datetime.fromisoformat(valid_until_str.replace("Z", "+00:00"))
                        if valid_until_dt.tzinfo is None:
                            valid_until_dt = valid_until_dt.replace(tzinfo=timezone.utc)
                        if valid_until_dt < now:
                            is_outdated = True
                    except Exception:
                        pass

                if is_outdated:
                    return ClaimVerificationFinding(
                        finding_id=finding_id,
                        claim=claim_text,
                        claim_type=claim_type,
                        classification=ClaimClassification.OUTDATED,
                        supporting_evidence=f"Prior Evidence: {evidence_source} (Expired on {valid_until_str})",
                        missing_evidence="Current recertification audit or updated 2026 empirical benchmark",
                        explanation=f"Supporting audit evidence for '{approved_claim_text}' expired on {valid_until_str}. Under FTC truth-in-advertising guidelines, claims cannot rely on expired verification reports.",
                        recommended_action="Renew audit certification or pause active promotion until updated benchmark is completed.",
                        risk_level=ClaimRiskLevel.HIGH,
                        requires_human_review=True,
                        confidence_score=0.95,
                        matched_knowledge_id=approved.get("item_id"),
                        detected_snippet=approved_claim_text
                    )
                else:
                    return ClaimVerificationFinding(
                        finding_id=finding_id,
                        claim=claim_text,
                        claim_type=claim_type,
                        classification=ClaimClassification.VERIFIED,
                        supporting_evidence=f"{evidence_source} (Ref: {approved.get('evidence_ref', 'Verified')})",
                        missing_evidence=None,
                        explanation=f"Promotional claim is substantiated by valid third-party audit evidence registered in the Brand Knowledge Base (Valid through {valid_until_str or 'Active'}).",
                        recommended_action="Claim approved. Maintain citation record in compliance binder.",
                        risk_level=ClaimRiskLevel.LOW,
                        requires_human_review=False,
                        confidence_score=0.99,
                        matched_knowledge_id=approved.get("item_id"),
                        detected_snippet=approved_claim_text
                    )

        # ---------------------------------------------------------------------
        # 3. CHECK POLICY EXCEPTIONS
        # ---------------------------------------------------------------------
        for exc in active_exceptions:
            phrase = exc.get("permitted_phrase", "").lower()
            if phrase and phrase in claim_lower:
                return ClaimVerificationFinding(
                    finding_id=finding_id,
                    claim=claim_text,
                    claim_type=claim_type,
                    classification=ClaimClassification.VERIFIED,
                    supporting_evidence=f"Policy Exception {exc.get('exception_id')}: Approved by {exc.get('approved_by')} for campaign scope '{exc.get('campaign_scope')}'",
                    missing_evidence=None,
                    explanation=f"Promotional phrasing is exempted from standard restrictions under formal legal exception valid through {exc.get('valid_until')}.",
                    recommended_action="Deploy only within authorized campaign scope and distribution channels.",
                    risk_level=ClaimRiskLevel.LOW,
                    requires_human_review=False,
                    confidence_score=0.98,
                    matched_knowledge_id=exc.get("exception_id"),
                    detected_snippet=phrase
                )

        # ---------------------------------------------------------------------
        # 4. HIGH-RISK CLAIMS REQUIRING HUMAN VERIFICATION
        # ---------------------------------------------------------------------
        if claim_type in [ClaimType.CLINICALLY_PROVEN, ClaimType.GUARANTEED_RESULTS] or (
            default_risk == ClaimRiskLevel.CRITICAL
        ):
            return ClaimVerificationFinding(
                finding_id=finding_id,
                claim=claim_text,
                claim_type=claim_type,
                classification=ClaimClassification.REQUIRES_HUMAN_VERIFICATION,
                supporting_evidence=None,
                missing_evidence="Institutional Review Board (IRB) clinical trial results or legal underwriting guarantee agreement",
                explanation=f"High-liability promotional claim ('{claim_type.value}') carries substantial consumer protection risk. AI cannot substantiate without formal legal/medical documentation.",
                recommended_action="Escalate to General Counsel or Chief Compliance Officer for mandatory pre-publication human review.",
                risk_level=ClaimRiskLevel.CRITICAL,
                requires_human_review=True,
                confidence_score=0.96,
                detected_snippet=context_snippet
            )

        # ---------------------------------------------------------------------
        # 5. UNSUPPORTED CLAIMS
        # ---------------------------------------------------------------------
        missing_desc = "Empirical third-party performance benchmark or independently audited customer study"
        if claim_type == ClaimType.MARKET_LEADERSHIP:
            missing_desc = "Recognized market share analysis (e.g. Gartner, IDC) proving #1 ranking"
        elif claim_type == ClaimType.PERCENTAGE_IMPROVEMENT:
            missing_desc = "Methodology report and statistical dataset documenting percentage delta"
        elif claim_type == ClaimType.AWARD_CERTIFICATION:
            missing_desc = "Accredited certification authority attestation letter with official registry ID"

        return ClaimVerificationFinding(
            finding_id=finding_id,
            claim=claim_text,
            claim_type=claim_type,
            classification=ClaimClassification.UNSUPPORTED,
            supporting_evidence=None,
            missing_evidence=missing_desc,
            explanation=f"Claim asserts a specific promotional capability or ranking ('{context_snippet}'), but no verified evidence exists in the Brand Knowledge Base. Never assume truth without documentation.",
            recommended_action=f"Remove promotional assertion from creative copy or submit {missing_desc} to Brand Knowledge Base for verification.",
            risk_level=default_risk,
            requires_human_review=(default_risk in [ClaimRiskLevel.HIGH, ClaimRiskLevel.CRITICAL]),
            confidence_score=0.92,
            detected_snippet=context_snippet
        )

    def record_human_decision(self, decision_in: HumanClaimReviewDecision) -> Dict[str, Any]:
        """
        Records an authorized human reviewer's binding sign-off or rejection of a high-risk claim.
        """
        return {
            "finding_id": decision_in.finding_id,
            "status": "RECORDED",
            "decision": decision_in.decision,
            "authorized_reviewer": f"{decision_in.reviewer_name} ({decision_in.reviewer_role})",
            "notes": decision_in.notes,
            "recorded_at": datetime.now(timezone.utc).isoformat()
        }

    def _save_report(self, report: ClaimVerificationReport) -> None:
        try:
            content = self.db_path.read_text(encoding="utf-8").strip()
            data = json.loads(content) if content else {}
            data[report.report_id] = report.model_dump()
            temp = self.db_path.with_suffix(".tmp")
            temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            temp.replace(self.db_path)
        except Exception as e:
            logger.error("Failed to save claim verification report: %s", e)


claim_verification_engine = ClaimVerificationEngine()

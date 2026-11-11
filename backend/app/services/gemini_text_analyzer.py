from __future__ import annotations
import json
import logging
import re
from typing import Any, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.models.content_review import ReviewDetectedIssue, ReviewIssueCategory, ReviewSeverity

logger = logging.getLogger(__name__)


class GeminiTextAnalyzer:
    """
    Analyzes creative text copy using Google Gemini against the organization's
    approved Brand DNA and official Knowledge Base.
    Detects:
    - Incorrect brand tone
    - Terminology inconsistencies
    - Messaging mismatches
    - Unsupported promotional claims
    - Incorrect or outdated information
    """

    async def analyze_text_copy(
        self,
        copy_text: str,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> List[ReviewDetectedIssue]:
        if not copy_text or not copy_text.strip():
            return []

        # 1. Deterministic layer: guaranteed zero-latency detection of banned terms, terminology, claims evidence
        deterministic_issues = self._deterministic_knowledge_audit(copy_text, brand_dna, knowledge_context)

        # 2. Multimodal / LLM reasoning layer: subtle tone, narrative messaging, and semantic claims
        ai_issues: List[ReviewDetectedIssue] = []
        if settings.has_gemini:
            try:
                ai_issues = await self._analyze_with_gemini(copy_text, brand_dna, knowledge_context)
            except Exception as exc:
                logger.warning("Gemini text analysis skipped due to API condition: %s", exc)

        # 3. Merge and deduplicate findings by category and detected phrase
        combined = list(deterministic_issues)
        seen_keys = {(i.issue_category.value, (i.detected_snippet or i.description[:30]).lower()) for i in deterministic_issues}

        for ai_iss in ai_issues:
            key = (ai_iss.issue_category.value, (ai_iss.detected_snippet or ai_iss.description[:30]).lower())
            if key not in seen_keys:
                seen_keys.add(key)
                combined.append(ai_iss)

        return combined

    async def _analyze_with_gemini(
        self,
        copy_text: str,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> List[ReviewDetectedIssue]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        prompt = f"""
You are an expert AI Brand Governance & Content Compliance Auditor.
Analyze the following creative advertising copy against the organization's approved Brand DNA and official Knowledge Base.

Submitted Creative Copy:
\"\"\"{copy_text}\"\"\"

Organization Approved Brand DNA:
{json.dumps(brand_dna, indent=2)}

Official Knowledge Base Context (Ground Truth):
{json.dumps(knowledge_context, indent=2)}

Strict Audit Directives:
1. INCORRECT BRAND TONE: Evaluate whether the copy violates the brand's primary voice, personality traits, or tone rules.
2. TERMINOLOGY INCONSISTENCIES: Check if approved terms are replaced by deprecated or off-brand synonyms.
3. MESSAGING MISMATCHES: Check if the copy departs from core brand pillars and positioning statements.
4. UNSUPPORTED PROMOTIONAL CLAIMS:
   - Identify every promotional claim, superlative, SLA number, or performance promise.
   - Cross-reference against "approved_promotional_claims" in the Knowledge Base.
   - If an approved claim matches verified evidence, you may emit a PASS finding citing the evidence.
   - If the copy makes an unsupported or exaggerated claim lacking verified evidence in the Knowledge Base, flag it as UNSUPPORTED_PROMOTIONAL_CLAIMS with WARNING or CRITICAL severity.
   - DO NOT fabricate findings or approve unsupported claims.
5. INCORRECT OR OUTDATED INFORMATION: Cross-reference facts, certifications, product names, and company data against "company_facts" and "products". Flag any discrepancy.
6. POLICY EXCEPTIONS: Check "active_policy_exceptions". If a term or claim is permitted under an approved exception, do NOT penalize it; emit an INFO finding acknowledging the exception.

You MUST return a JSON object with a key "findings" containing an array of issues.
Every issue MUST contain EXACTLY these fields:
- issue_category: "incorrect_brand_tone" | "terminology_inconsistencies" | "messaging_mismatches" | "unsupported_promotional_claims" | "incorrect_or_outdated_info"
- severity: "PASS" | "INFO" | "WARNING" | "CRITICAL"
- description: concise summary of the issue
- relevant_guideline: citation of the exact brand rule or knowledge base entry
- explanation: detailed explanation of the discrepancy and risk
- recommended_correction: actionable instructions to fix it
- confidence_level: float between 0.0 and 1.0
- detected_snippet: exact phrase from the copy
- evidence_citation: evidence reference from the Knowledge Base (or "None verified" if missing)
"""

        response = client.models.generate_content(
            model=settings.DEFAULT_TEXT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )

        raw_json = json.loads(response.text)
        items = raw_json.get("findings", [])
        if isinstance(raw_json, list):
            items = raw_json

        validated_issues: List[ReviewDetectedIssue] = []
        for it in items:
            try:
                cat_str = it.get("issue_category", "").lower().replace(" ", "_")
                cat_enum = ReviewIssueCategory(cat_str)
                sev_enum = ReviewSeverity(it.get("severity", "WARNING").upper())
                conf = float(it.get("confidence_level", 0.90))
                conf = max(0.0, min(1.0, conf))

                validated_issues.append(ReviewDetectedIssue(
                    issue_category=cat_enum,
                    severity=sev_enum,
                    description=it.get("description", "Discrepancy detected in text copy"),
                    relevant_guideline=it.get("relevant_guideline", "Official Brand Guidelines"),
                    explanation=it.get("explanation", ""),
                    recommended_correction=it.get("recommended_correction", "Revise copy to align with brand standards"),
                    confidence_level=conf,
                    source_engine="gemini_text_analyzer",
                    detected_snippet=it.get("detected_snippet"),
                    evidence_citation=it.get("evidence_citation")
                ))
            except Exception as e:
                logger.debug("Skipping malformed finding from Gemini: %s", e)

        return validated_issues

    def _deterministic_knowledge_audit(
        self,
        copy_text: str,
        brand_dna: Dict[str, Any],
        knowledge_context: Dict[str, Any]
    ) -> List[ReviewDetectedIssue]:
        """
        Deterministic knowledge base audit engine when cloud API is offline.
        """
        issues: List[ReviewDetectedIssue] = []
        text_lower = copy_text.lower()

        # 1. Prohibited messaging check
        prohibited_terms = knowledge_context.get("prohibited_messaging", [])
        active_exceptions = knowledge_context.get("active_policy_exceptions", [])
        exception_phrases = {e.get("permitted_phrase", "").lower() for e in active_exceptions}

        for term in prohibited_terms:
            t_lower = term.lower()
            if t_lower in text_lower:
                # Check if covered by policy exception
                covered_exception = next((e for e in active_exceptions if t_lower in e.get("permitted_phrase", "").lower() or e.get("permitted_phrase", "").lower() in text_lower), None)
                if covered_exception:
                    issues.append(ReviewDetectedIssue(
                        issue_category=ReviewIssueCategory.MESSAGING_MISMATCHES,
                        severity=ReviewSeverity.INFO,
                        description=f"Policy Exception Applied: Term '{term}' permitted",
                        relevant_guideline=f"Exception {covered_exception.get('exception_id')}: {covered_exception.get('rule_name')}",
                        explanation=f"Phrase permitted under approved campaign exception signed by {covered_exception.get('approved_by')}.",
                        recommended_correction="Ensure creative is distributed only within the authorized campaign window.",
                        confidence_level=1.0,
                        source_engine="knowledge_base_verifier",
                        detected_snippet=term,
                        evidence_citation=f"Approved Exception ID: {covered_exception.get('exception_id')}"
                    ))
                else:
                    issues.append(ReviewDetectedIssue(
                        issue_category=ReviewIssueCategory.MESSAGING_MISMATCHES,
                        severity=ReviewSeverity.CRITICAL,
                        description=f"Prohibited Brand Messaging: '{term}' detected",
                        relevant_guideline="Knowledge Base Policy: Strictly Prohibited Copy & Unsubstantiated Claims",
                        explanation=f"Brand policy strictly prohibits '{term}' due to regulatory and brand integrity standards.",
                        recommended_correction=f"Remove prohibited term '{term}' and replace with verifiable capability statements.",
                        confidence_level=0.98,
                        source_engine="knowledge_base_verifier",
                        detected_snippet=term
                    ))

        # 2. Terminology check
        term_map = knowledge_context.get("approved_terminology_map", {})
        for unapproved, approved in term_map.items():
            if unapproved.lower() in text_lower:
                issues.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.TERMINOLOGY_INCONSISTENCIES,
                    severity=ReviewSeverity.WARNING,
                    description=f"Non-approved terminology '{unapproved}' used",
                    relevant_guideline="Knowledge Base Approved Lexicon & Terminology Standard",
                    explanation=f"'{unapproved}' is a deprecated or competitor term. The official brand term is '{approved}'.",
                    recommended_correction=f"Replace '{unapproved}' with approved term '{approved}'.",
                    confidence_level=0.95,
                    source_engine="knowledge_base_verifier",
                    detected_snippet=unapproved
                ))

        # 3. Promotional Claims verification
        approved_claims = knowledge_context.get("approved_promotional_claims", [])
        verified_match = False
        for claim in approved_claims:
            claim_text = claim.get("claim_text", "")
            if claim_text and claim_text.lower() in text_lower:
                verified_match = True
                issues.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.UNSUPPORTED_PROMOTIONAL_CLAIMS,
                    severity=ReviewSeverity.PASS,
                    description=f"Approved Promotional Claim Verified: '{claim_text}'",
                    relevant_guideline="Knowledge Base Approved Promotional Claims Catalog",
                    explanation="Claim is substantiated by formal audit evidence verified by compliance.",
                    recommended_correction="No correction needed. Claim meets all substantiation requirements.",
                    confidence_level=0.99,
                    source_engine="knowledge_base_verifier",
                    detected_snippet=claim_text,
                    evidence_citation=f"Evidence: {claim.get('evidence_source')}"
                ))

        # 4. Check for unverified superlatives
        unverified_superlatives = ["100% guaranteed", "fastest on earth", "hacker proof", "unbreakable", "#1 cloud"]
        for sup in unverified_superlatives:
            if sup in text_lower and not verified_match:
                issues.append(ReviewDetectedIssue(
                    issue_category=ReviewIssueCategory.UNSUPPORTED_PROMOTIONAL_CLAIMS,
                    severity=ReviewSeverity.CRITICAL,
                    description=f"Unsupported Promotional Claim: '{sup}' lacks verified evidence",
                    relevant_guideline="FTC Truth-in-Advertising & Brand Claim Substantiation Standard",
                    explanation="Promotional claims must be substantiated by empirical audit evidence before publication.",
                    recommended_correction=f"Remove superlative '{sup}' or submit formal third-party audit evidence to Brand Knowledge Base.",
                    confidence_level=0.92,
                    source_engine="knowledge_base_verifier",
                    detected_snippet=sup,
                    evidence_citation="None verified in Knowledge Base"
                ))

        return issues


gemini_text_analyzer = GeminiTextAnalyzer()

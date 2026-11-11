from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class ClaimType(str, Enum):
    MARKET_LEADERSHIP = "number_one_in_industry"
    GUARANTEED_RESULTS = "guaranteed_results"
    CLINICALLY_PROVEN = "clinically_proven"
    BEST_SELLING = "best_selling_products"
    PERCENTAGE_IMPROVEMENT = "percentage_improvement_claims"
    PERFORMANCE_METRIC = "performance_claims"
    AWARD_CERTIFICATION = "awards_and_certifications"
    GENERAL_FACTUAL = "general_factual_claim"


class ClaimClassification(str, Enum):
    VERIFIED = "verified_against_approved_evidence"
    UNSUPPORTED = "unsupported"
    CONTRADICTORY = "contradictory"
    OUTDATED = "potentially_outdated"
    REQUIRES_HUMAN_VERIFICATION = "requires_human_verification"


class ClaimRiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ClaimVerificationFinding(BaseModel):
    """
    Standardized finding representing an audited promotional claim or factual statement.
    Adheres strictly to the specification:
    - Claim
    - Supporting evidence or missing evidence
    - Explanation
    - Recommended action
    - Risk classification & human review requirement
    """
    finding_id: str = Field(..., description="Unique claim finding identifier")
    claim: str = Field(..., description="Exact claim detected in the copy")
    claim_type: ClaimType = Field(..., description="Category of promotional claim detected")
    classification: ClaimClassification = Field(..., description="One of 5 official audit classifications")
    supporting_evidence: Optional[str] = Field(default=None, description="Verified evidence source citation from Knowledge Base")
    missing_evidence: Optional[str] = Field(default=None, description="Exact evidence required to legally/technically substantiate the claim")
    explanation: str = Field(..., description="Comprehensive explanation of verification outcome and risk")
    recommended_action: str = Field(..., description="Actionable instruction to resolve compliance")
    risk_level: ClaimRiskLevel = Field(default=ClaimRiskLevel.MEDIUM, description="Risk level (LOW, MEDIUM, HIGH, CRITICAL)")
    requires_human_review: bool = Field(default=False, description="True if authorized human sign-off is required")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Audit confidence level")
    matched_knowledge_id: Optional[str] = Field(default=None, description="Knowledge Base item ID if matched")
    detected_snippet: Optional[str] = Field(default=None, description="Surrounding text context")

    @field_validator("requires_human_review")
    @classmethod
    def enforce_high_risk_human_review(cls, v: bool, info) -> bool:
        """
        Rule: High-risk claims must require authorised human review.
        """
        risk = info.data.get("risk_level")
        classification = info.data.get("classification")
        if risk in (ClaimRiskLevel.HIGH, ClaimRiskLevel.CRITICAL) or classification in (
            ClaimClassification.CONTRADICTORY,
            ClaimClassification.REQUIRES_HUMAN_VERIFICATION
        ):
            return True
        return v


class ClaimVerificationRequest(BaseModel):
    org_id: str = Field(default="default-org", description="Organization ID guaranteeing tenant isolation")
    brand_id: str = Field(default="apex-cloud", description="Brand ID to verify against")
    text: Optional[str] = Field(default=None, description="Marketing copy, press release, or ad caption")
    file_path: Optional[str] = Field(default=None, description="Uploaded asset path (poster, image, or PDF)")
    require_strict_evidence: bool = Field(default=True, description="Enforce strict proof rule: never assume true without evidence")


class ClaimVerificationReport(BaseModel):
    """
    Comprehensive verification report returned by the claim verification engine.
    """
    report_id: str = Field(..., description="Unique verification report identifier")
    org_id: str = Field(..., description="Tenant organization ID")
    brand_id: str = Field(..., description="Brand ID")
    content_source: str = Field(..., description="Text input or file name audited")
    overall_classification: ClaimClassification = Field(..., description="Aggregated worst-case classification")
    overall_claim_score: float = Field(..., ge=0.0, le=100.0, description="Factual integrity score")
    total_claims_detected: int = Field(default=0)
    verified_count: int = Field(default=0)
    unsupported_count: int = Field(default=0)
    contradictory_count: int = Field(default=0)
    outdated_count: int = Field(default=0)
    requires_human_review_count: int = Field(default=0)
    requires_human_review: bool = Field(default=False, description="True if any claim requires human sign-off")
    findings: List[ClaimVerificationFinding] = Field(default_factory=list)
    human_review_routing: Optional[Dict[str, Any]] = Field(default=None, description="Authorized department/role for review")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HumanClaimReviewDecision(BaseModel):
    finding_id: str
    reviewer_name: str
    reviewer_role: str = Field(..., description="Must be authorized role: General Counsel, Chief Compliance Officer, Brand VP")
    decision: str = Field(..., description="APPROVED, REJECTED, EXEMPTED_WITH_STIPULATIONS")
    evidence_file_or_memo: Optional[str] = None
    notes: str = Field(..., description="Mandatory audit trail justification")

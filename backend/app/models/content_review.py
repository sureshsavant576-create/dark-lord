from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class ContentType(str, Enum):
    TEXT = "text"
    POSTER_IMAGE = "poster_image"
    PDF = "pdf"
    SOCIAL_MEDIA_CREATIVE = "social_media_creative"
    MARKETING_AD = "marketing_ad"
    PROMOTIONAL_CONTENT = "promotional_content"


class ReviewIssueCategory(str, Enum):
    INCORRECT_BRAND_TONE = "incorrect_brand_tone"
    TERMINOLOGY_INCONSISTENCIES = "terminology_inconsistencies"
    MESSAGING_MISMATCHES = "messaging_mismatches"
    VISUAL_IDENTITY_VIOLATIONS = "visual_identity_violations"
    INCORRECT_LOGO_USAGE = "incorrect_logo_usage"
    COLOUR_INCONSISTENCIES = "colour_inconsistencies"
    TYPOGRAPHY_INCONSISTENCIES = "typography_inconsistencies"
    UNSUPPORTED_PROMOTIONAL_CLAIMS = "unsupported_promotional_claims"
    INCORRECT_OR_OUTDATED_INFO = "incorrect_or_outdated_info"
    ACCESSIBILITY_PROBLEMS = "accessibility_problems"


class ReviewSeverity(str, Enum):
    PASS = "PASS"
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class ReviewDetectedIssue(BaseModel):
    """
    Standardized finding schema adhering strictly to the hackathon specification:
    Every detected issue must include:
    - Issue category
    - Severity
    - Description
    - Relevant guideline
    - Explanation
    - Recommended correction
    - Confidence level
    """
    issue_category: ReviewIssueCategory = Field(..., description="One of the 10 mandated issue categories")
    severity: ReviewSeverity = Field(..., description="Severity rating of the issue")
    description: str = Field(..., description="Concise human-readable summary of the detected discrepancy")
    relevant_guideline: str = Field(..., description="Specific brand guideline, Knowledge Base policy, or verified claim citation")
    explanation: str = Field(..., description="Detailed explanation of the risk, departure, or violation")
    recommended_correction: str = Field(..., description="Concrete, actionable correction steps to achieve compliance")
    confidence_level: float = Field(..., ge=0.0, le=1.0, description="Algorithmic or model confidence rating from 0.0 to 1.0")
    source_engine: str = Field(default="hybrid_reviewer", description="Engine producing this finding: gemini_text, groq_vision, opencv_analyzer, etc.")
    detected_snippet: Optional[str] = Field(default=None, description="Actual off-brand text or visual feature detected")
    evidence_citation: Optional[str] = Field(default=None, description="Knowledge Base evidence backing or rebutting the finding")


class ContentReviewRequest(BaseModel):
    org_id: str = Field(default="default-org", description="Organization ID for tenant isolation")
    brand_id: str = Field(..., description="Brand ID to audit against")
    content_type: ContentType = Field(default=ContentType.MARKETING_AD, description="Type of creative content submitted")
    department: Optional[str] = Field(default="Marketing", description="Submitting department")
    copy_text: Optional[str] = Field(default=None, description="Advertising copy, caption, or textual script")
    file_path: Optional[str] = Field(default=None, description="Absolute or relative path to uploaded image or PDF")
    campaign_context: Optional[str] = Field(default=None, description="Optional campaign context for policy exception matching")


class MeasurableImageProperties(BaseModel):
    """
    Deterministic image properties computed empirically via OpenCV.
    """
    dimensions: Dict[str, int] = Field(default_factory=lambda: {"width": 0, "height": 0})
    aspect_ratio: float = 1.0
    aspect_ratio_label: str = "custom"
    dominant_palette_hex: List[str] = Field(default_factory=list)
    nearest_brand_colors: List[Dict[str, Any]] = Field(default_factory=list)
    dominant_color_delta_e: float = 0.0
    min_delta_e: float = 0.0
    whitespace_ratio: float = 0.0
    edge_density: float = 0.0
    luminance_mean: float = 0.0
    wcag_contrast_ratio: float = 1.0
    wcag_aa_compliant: bool = True
    logo_detected: bool = False
    logo_clear_space_px: Optional[int] = None
    logo_clear_space_compliant: bool = True


class ContentReviewReport(BaseModel):
    """
    Full comprehensive audit report returned by the Content Review System.
    """
    review_id: str = Field(..., description="Unique review identifier")
    org_id: str = Field(..., description="Tenant organization ID")
    brand_id: str = Field(..., description="Audited brand identifier")
    brand_name: str = Field(..., description="Audited brand name")
    content_type: ContentType
    content_filename: Optional[str] = None
    department: Optional[str] = Field(default="Marketing", description="Submitting department")
    overall_score: float = Field(..., ge=0.0, le=100.0, description="Overall compliance score from 0 to 100")
    is_approved: bool = Field(default=False, description="True if content meets pass threshold with zero critical violations")
    detected_issues: List[ReviewDetectedIssue] = Field(default_factory=list)
    measurable_properties: Optional[MeasurableImageProperties] = None
    extracted_text: Optional[str] = None
    knowledge_base_citations: List[Dict[str, Any]] = Field(default_factory=list)
    text_model_used: str = "gemini-3.1-flash-lite"
    vision_model_used: str = "groq-llama-3.2-11b-vision"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

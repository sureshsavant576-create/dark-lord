from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class FindingSeverity(str, Enum):
    PASS = "PASS"
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"

class FindingCategory(str, Enum):
    COLOR = "COLOR"
    TERMINOLOGY = "TERMINOLOGY"
    TONE = "TONE"
    MOOD = "MOOD"
    PERSONALITY = "PERSONALITY"
    VISUAL_STYLE = "VISUAL_STYLE"
    TYPOGRAPHY = "TYPOGRAPHY"
    LAYOUT = "LAYOUT"
    BIOMETRIC_VECTOR = "BIOMETRIC_VECTOR"
    TECHNICAL = "TECHNICAL"

class FindingSource(str, Enum):
    DETERMINISTIC_CHECK = "DETERMINISTIC_CHECK"
    AI_MODEL_INFERENCE = "AI_MODEL_INFERENCE"

class InspectionVerdict(str, Enum):
    APPROVED = "APPROVED"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    REJECTED = "REJECTED"
    REQUIRES_HUMAN_REVIEW = "REQUIRES_HUMAN_REVIEW"

class InspectionFinding(BaseModel):
    id: str
    title: str
    category: FindingCategory
    source: FindingSource
    severity: FindingSeverity
    detected_value: str
    expected_value: str
    explanation: str
    suggested_correction: Optional[str] = None
    evidence_snippet: Optional[str] = None
    confidence_score: float = 1.0

class InspectionReport(BaseModel):
    inspection_id: str
    brand_id: str
    brand_name: str
    submission_filename: str
    media_category: str
    submission_file_path: Optional[str] = Field(default=None, description="Absolute on-disk storage path of the analyzed file")
    annotated_preview_path: Optional[str] = Field(default=None, description="Path of any generated visual proof or heatmap")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    submitted_by: str = Field(default="default-dev", description="Identity of the submitting developer/user")
    org_id: str = Field(default="default-org", description="Organization identity")

    verdict: InspectionVerdict
    overall_score: Optional[float] = Field(description="Blended score (0-100) or None if AI is unconfigured and score cannot be verified")
    deterministic_score: float = Field(description="Score derived purely from objective code checks (0-100)")
    ai_score: Optional[float] = Field(default=None, description="Score assessed by multimodal AI model or None")
    
    ai_explanation: Optional[str] = Field(default=None, description="Detailed explanation generated directly by Gemini AI")
    ai_mood_detected: Optional[str] = Field(default=None, description="Emotional mood detected by Gemini AI")
    ai_personality_detected: Optional[str] = Field(default=None, description="Brand personality detected by Gemini AI")
    ai_tone_detected: Optional[str] = Field(default=None, description="Communication tone detected by Gemini AI")
    ai_typography_detected: Optional[str] = Field(default=None, description="Typography hierarchy and style detected by AI")
    ai_layout_detected: Optional[str] = Field(default=None, description="Layout structure and density detected by AI")
    
    biometric_match: Optional[Dict[str, Any]] = Field(default=None, description="Biometric mathematical vector match scores")
    findings: List[InspectionFinding] = Field(default_factory=list)
    matching_characteristics: List[str] = Field(default_factory=list)
    mismatches: List[str] = Field(default_factory=list)
    guideline_violations: List[str] = Field(default_factory=list)
    suggested_corrections: List[str] = Field(default_factory=list)

    human_review_required: bool = True
    human_decision: str = "PENDING"
    reviewer_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None

    technical_summary: Dict[str, Any] = Field(default_factory=dict)

class HumanReviewSubmission(BaseModel):
    inspection_id: str
    decision: str = Field(description="'APPROVED', 'CHANGES_REQUESTED', or 'REJECTED'")
    reviewer_name: Optional[str] = Field(default=None, description="Name or identifier of human reviewer")
    reviewer_email: Optional[str] = Field(default=None, description="Email of human reviewer")
    reviewer_notes: Optional[str] = Field(default="")

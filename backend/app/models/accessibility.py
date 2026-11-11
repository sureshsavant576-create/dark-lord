from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class AccessibilityDimension(str, Enum):
    COLOUR_CONTRAST = "colour_contrast"
    TEXT_READABILITY = "text_readability"
    TEXT_VISIBILITY = "text_visibility"
    FONT_SIZE = "font_size"
    IMAGE_ALT_TEXT = "image_alt_text"
    BASIC_CONTENT_ACCESSIBILITY = "basic_content_accessibility"


class AccessibilitySeverity(str, Enum):
    PASS = "PASS"
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AccessibilityIssue(BaseModel):
    """
    Structured accessibility finding.
    Enforces Rule: Do not report an accessibility requirement as passed unless it has actually been checked.
    """
    issue_id: str = Field(..., description="Unique issue identifier")
    dimension: AccessibilityDimension = Field(..., description="One of the 6 evaluated accessibility dimensions")
    severity: AccessibilitySeverity = Field(..., description="Severity rating (PASS, INFO, WARNING, CRITICAL)")
    title: str = Field(..., description="Concise issue headline")
    description: str = Field(..., description="Summary of the evaluated accessibility property")
    explanation: str = Field(..., description="Detailed explanation of the barrier and impact on users with disabilities")
    recommended_correction: str = Field(..., description="Actionable correction to satisfy WCAG compliance")
    checked: bool = Field(default=True, description="Enforces that this requirement has been genuinely evaluated")
    measurable_value: Optional[str] = Field(default=None, description="Measured empirical value (e.g. 'Contrast: 2.8:1', 'Font: 9px')")
    required_standard: Optional[str] = Field(default=None, description="Referenced WCAG standard (e.g. 'WCAG 2.1 AA (min 4.5:1)')")
    confidence_score: float = Field(default=0.95, ge=0.0, le=1.0)
    evaluation_method: str = Field(default="opencv_measurable", description="opencv_measurable, readability_index, or ai_contextual")

    @field_validator("checked")
    @classmethod
    def validate_checked_requirement(cls, v: bool, info) -> bool:
        if not v and info.data.get("severity") == AccessibilitySeverity.PASS:
            raise ValueError("Invalid Report: Cannot report an accessibility requirement as passed unless it has actually been checked.")
        return v


class AccessibilityMetrics(BaseModel):
    """
    Empirical, objective accessibility metrics computed via OpenCV and readability algorithms.
    """
    contrast_ratio: Optional[float] = None
    wcag_aa_passed: Optional[bool] = None
    wcag_aaa_passed: Optional[bool] = None
    min_font_size_px: Optional[int] = None
    max_font_size_px: Optional[int] = None
    font_size_compliant: Optional[bool] = None
    flesch_reading_ease: Optional[float] = None
    flesch_kincaid_grade: Optional[float] = None
    readability_level: Optional[str] = None
    background_clutter_score: Optional[float] = None
    text_visibility_score: Optional[float] = None
    color_blind_accessible: Optional[bool] = None
    generated_alt_text: Optional[str] = None
    dimensions_evaluated: List[AccessibilityDimension] = Field(default_factory=list)


class AccessibilityReport(BaseModel):
    """
    Comprehensive accessibility audit report.
    """
    report_id: str = Field(..., description="Unique audit report identifier")
    target_filename: Optional[str] = None
    overall_score: float = Field(..., ge=0.0, le=100.0, description="Overall accessibility compliance score from 0 to 100")
    is_accessible: bool = Field(default=False, description="True if content meets minimum WCAG AA accessibility standards")
    wcag_conformance_level: str = Field(default="NONE", description="WCAG_2_1_AAA, WCAG_2_1_AA, WCAG_2_1_A, or NONE")
    dimensions_checked: List[Dict[str, Any]] = Field(default_factory=list, description="Explicit record of checked dimensions")
    issues: List[AccessibilityIssue] = Field(default_factory=list)
    metrics: AccessibilityMetrics = Field(default_factory=AccessibilityMetrics)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AccessibilityCheckRequest(BaseModel):
    file_path: Optional[str] = None
    text_copy: Optional[str] = None
    provided_alt_text: Optional[str] = None
    target_wcag_level: str = Field(default="AA", description="Target compliance standard: A, AA, or AAA")

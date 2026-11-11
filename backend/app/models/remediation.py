from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VisualProblemType(str, Enum):
    OFF_BRAND_COLOR = "off_brand_color"
    BACKGROUND_COLOR_DEVIATION = "background_color_deviation"
    CONTRAST_DEFICIENCY = "contrast_deficiency"
    VISUAL_INCONSISTENCY = "visual_inconsistency"


class VisualProblem(BaseModel):
    problem_type: VisualProblemType
    description: str
    severity: str = "WARNING"
    detected_value: str
    target_brand_value: str
    guideline_reference: str


class AppliedCorrection(BaseModel):
    category: str
    description: str
    change_type: str
    original_metric: str
    corrected_metric: str
    elements_preserved: List[str] = Field(default_factory=list)


class VisualRemediationResult(BaseModel):
    remediation_id: str
    status: str = "REMEDIATED_STAGED_FOR_REVIEW"
    brand_id: str
    brand_name: str
    original_image_url: str
    remediated_image_url: str
    visual_problems_identified: List[VisualProblem] = Field(default_factory=list)
    applied_corrections: List[AppliedCorrection] = Field(default_factory=list)
    elements_preserved: List[str] = Field(default_factory=list)
    previous_delta_e: float
    new_delta_e: float
    previous_contrast_ratio: Optional[float] = None
    new_contrast_ratio: Optional[float] = None
    color_compliance_score: float
    is_certified: bool
    requires_human_approval: bool = True
    is_generative_api_active: bool = False
    generative_limitation_notice: Optional[str] = None
    ai_generated_disclosure: str = "This image contains AI-assisted visual corrections (color remapping, contrast improvement, background harmonization). Human review and signoff is required before publishing."


class RemediationDecisionRequest(BaseModel):
    remediation_id: str
    brand_id: str
    decision: str = Field(..., description="'accept' or 'reject'")
    reviewed_by: Optional[str] = "Brand Designer"
    notes: Optional[str] = None

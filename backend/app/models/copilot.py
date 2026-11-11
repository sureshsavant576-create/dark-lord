from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SuggestionType(str, Enum):
    HEADLINE = "headline"
    TONE_REWRITE = "tone_rewrite"
    TERMINOLOGY_CORRECTION = "terminology_correction"
    MESSAGING_IMPROVEMENT = "messaging_improvement"
    CLAIM_REMEDIATION = "claim_remediation"
    GENERAL = "general"


class SuggestionStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class RemediationSuggestion(BaseModel):
    id: str = Field(..., description="Unique suggestion identifier")
    type: SuggestionType = Field(default=SuggestionType.GENERAL, description="Remediation category")
    original_content: str = Field(..., description="Original creator content that triggered violation or needs improvement")
    suggested_correction: str = Field(..., description="Compliant brand-aligned suggested replacement")
    reason_for_correction: str = Field(..., description="Detailed explanation of why this change is necessary")
    guideline_reference: str = Field(..., description="Citation of specific Brand DNA pillar or Knowledge Base guideline")
    status: SuggestionStatus = Field(default=SuggestionStatus.PENDING, description="Workflow acceptance status")
    created_at: Optional[str] = None


class StepByStepGuidance(BaseModel):
    step_number: int = Field(..., description="Sequence index in remediation workflow")
    action_title: str = Field(..., description="Concise action heading")
    instruction: str = Field(..., description="Concrete, actionable direction for the creator")
    target_issue: str = Field(..., description="Issue or discrepancy being addressed")
    severity: str = Field(default="WARNING", description="Severity level of the underlying issue")


class CopilotChatRequest(BaseModel):
    brand_id: Optional[str] = Field(default=None, description="Target brand identifier")
    message: str = Field(..., description="User query or instruction to the Brand Co-Pilot")
    inspection_id: Optional[str] = Field(default=None, description="Associated content audit report ID")
    copy_text: Optional[str] = Field(default=None, description="Creative copy text being audited")
    detected_issues: List[Dict[str, Any]] = Field(default_factory=list, description="Structured issues from content review")
    discrepancies: List[str] = Field(default_factory=list, description="List of issue descriptions or rule failures")
    prohibited_claims: List[str] = Field(default_factory=list, description="Flagged unverified or prohibited claims")
    intent: Optional[str] = Field(default=None, description="Explicit action intent: headlines, tone, terminology, guidance")
    history: List[Dict[str, str]] = Field(default_factory=list, description="Conversation chat history")


class CopilotChatResponse(BaseModel):
    reply: str = Field(..., description="Brand Co-Pilot conversational response in authentic brand voice")
    brand_name: str = Field(..., description="Target brand name")
    brand_persona: str = Field(..., description="Brand persona identity description")
    structured_corrections: List[RemediationSuggestion] = Field(default_factory=list, description="Granular accept/reject corrections")
    step_by_step_guidance: List[StepByStepGuidance] = Field(default_factory=list, description="Numbered remediation steps")
    suggested_rewrites: List[str] = Field(default_factory=list, description="Alternative copy variations")
    palette_recommendations: List[str] = Field(default_factory=list, description="Approved brand palette HEX codes")
    quick_prompts: List[str] = Field(default_factory=list, description="Contextual quick action prompts")
    original_purpose_preserved: bool = Field(default=True, description="Whether the creator original intent was preserved")
    context_sources_used: List[str] = Field(default_factory=list, description="Brand DNA and Knowledge Base sources referenced")


class CopilotActionRequest(BaseModel):
    brand_id: str
    suggestion_id: str
    action: str = Field(..., description="'accept', 'reject', or 'request_alternative'")
    suggestion_type: Optional[str] = None
    original_content: Optional[str] = None
    suggested_correction: Optional[str] = None
    copy_text: Optional[str] = None


class CopilotStagedReview(BaseModel):
    brand_id: str
    brand_name: str
    accepted_corrections: List[RemediationSuggestion] = Field(default_factory=list)
    staged_copy: str = ""
    status: str = "STAGED_FOR_CREATOR_REVIEW"
    notice: str = "Accepted changes are staged for internal creator review before submission. Content will NOT be published automatically."

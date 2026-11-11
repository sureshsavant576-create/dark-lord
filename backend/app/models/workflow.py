from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WorkflowRole(str, Enum):
    CREATOR = "Creator"
    MANAGER = "Manager"
    AUTHORISED_REVIEWER = "Authorised Reviewer"
    ADMINISTRATOR = "Administrator"


class ContentStatus(str, Enum):
    DRAFT = "Draft"
    UNDER_REVIEW = "Under Review"
    NEEDS_REVISION = "Needs Revision"
    APPROVED = "Approved"
    APPROVED_WITH_WARNINGS = "Approved with Warnings"
    REJECTED = "Rejected"
    ESCALATED = "Escalated"


class WorkflowComment(BaseModel):
    comment_id: str
    item_id: str
    version_number: int
    user_id: str
    user_name: str
    role: WorkflowRole
    text: str
    target_issue_id: Optional[str] = None
    created_at: str


class ContentVersion(BaseModel):
    version_number: int
    content_text: str
    image_url: Optional[str] = None
    submitted_by: str
    submitted_at: str
    change_summary: str
    analysis_report_id: Optional[str] = None
    compliance_score: Optional[float] = None
    findings_summary: List[str] = Field(default_factory=list)
    has_high_risk_claims: bool = False


class WorkflowAuditLogEntry(BaseModel):
    entry_id: str
    item_id: str
    timestamp: str
    actor_id: str
    actor_name: str
    actor_role: WorkflowRole
    action: str  # "CREATE_DRAFT", "SUBMIT_FOR_REVIEW", "COMMENT", "REQUEST_REVISION", "REVISE", "APPROVE", "APPROVE_WITH_WARNINGS", "REJECT", "ESCALATE"
    from_status: Optional[ContentStatus] = None
    to_status: Optional[ContentStatus] = None
    details: str
    org_id: str


class WorkflowItem(BaseModel):
    item_id: str
    org_id: str
    brand_id: str
    title: str
    status: ContentStatus = ContentStatus.DRAFT
    current_version: int = 1
    versions: List[ContentVersion] = Field(default_factory=list)
    comments: List[WorkflowComment] = Field(default_factory=list)
    approval_history: List[WorkflowAuditLogEntry] = Field(default_factory=list)
    has_high_risk_claims: bool = False
    escalated_to: Optional[str] = None
    escalation_reason: Optional[str] = None
    assigned_reviewer: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str


class SubmitContentRequest(BaseModel):
    org_id: str
    brand_id: str
    title: str
    content_text: str
    image_url: Optional[str] = None
    user_id: str
    user_name: str
    user_role: WorkflowRole = WorkflowRole.CREATOR
    has_high_risk_claims: bool = False
    analysis_report_id: Optional[str] = None
    compliance_score: Optional[float] = None
    findings_summary: List[str] = Field(default_factory=list)


class CommentRequest(BaseModel):
    user_id: str
    user_name: str
    user_role: WorkflowRole
    text: str
    target_issue_id: Optional[str] = None


class RevisionRequest(BaseModel):
    user_id: str
    user_name: str
    user_role: WorkflowRole
    feedback: str


class ReviseContentRequest(BaseModel):
    user_id: str
    user_name: str
    user_role: WorkflowRole = WorkflowRole.CREATOR
    content_text: str
    image_url: Optional[str] = None
    change_summary: str
    has_high_risk_claims: bool = False
    analysis_report_id: Optional[str] = None
    compliance_score: Optional[float] = None
    findings_summary: List[str] = Field(default_factory=list)


class ApprovalDecisionRequest(BaseModel):
    user_id: str
    user_name: str
    user_role: WorkflowRole
    decision: str = Field(..., description="'approve', 'approve_with_warnings', or 'reject'")
    notes: Optional[str] = None

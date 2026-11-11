from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field

from backend.app.core.security import UserRole


class AuditEventType(str, Enum):
    # Authentication & Session
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"

    # Creative & Content
    FILE_UPLOAD = "FILE_UPLOAD"
    FILE_ACCESS = "FILE_ACCESS"
    REVIEW_SUBMITTED = "REVIEW_SUBMITTED"
    STATUS_TRANSITION = "STATUS_TRANSITION"
    REVISION_REQUESTED = "REVISION_REQUESTED"
    REVIEW_APPROVED = "REVIEW_APPROVED"
    REVIEW_REJECTED = "REVIEW_REJECTED"

    # Escalations & Policy
    CLAIM_ESCALATED = "CLAIM_ESCALATED"
    CLAIM_RESOLVED = "CLAIM_RESOLVED"
    POLICY_EXCEPTION_REQUESTED = "POLICY_EXCEPTION_REQUESTED"
    POLICY_EXCEPTION_APPROVED = "POLICY_EXCEPTION_APPROVED"

    # Governance & Knowledge Base
    BRAND_DNA_UPDATED = "BRAND_DNA_UPDATED"
    KNOWLEDGE_BASE_MUTATED = "KNOWLEDGE_BASE_MUTATED"
    REMEDIATION_ACCEPTED = "REMEDIATION_ACCEPTED"
    REMEDIATION_REJECTED = "REMEDIATION_REJECTED"

    # Security & Access Control
    ACCESS_DENIED = "ACCESS_DENIED"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    PATH_TRAVERSAL_BLOCKED = "PATH_TRAVERSAL_BLOCKED"


class AuditEventSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AuditEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    org_id: str = Field(default="default-org")
    user_id: str = Field(default="system")
    user_role: str = Field(default=UserRole.CREATOR.value)
    event_type: AuditEventType = Field(...)
    severity: AuditEventSeverity = Field(default=AuditEventSeverity.INFO)
    resource_type: str = Field(default="general")
    resource_id: Optional[str] = Field(default=None)
    action: str = Field(default="")
    details: Dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = Field(default=None)
    success: bool = Field(default=True)


class AuditLogQuery(BaseModel):
    org_id: str = Field(default="default-org")
    event_type: Optional[AuditEventType] = None
    severity: Optional[AuditEventSeverity] = None
    user_id: Optional[str] = None
    resource_type: Optional[str] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class AuditLogSummary(BaseModel):
    org_id: str
    total_events: int
    by_event_type: Dict[str, int]
    by_severity: Dict[str, int]
    recent_security_alerts: List[AuditEvent]

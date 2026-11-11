from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from backend.app.core.security import (
    UserRole,
    check_role_permission,
    sanitize_org_id,
)
from backend.app.models.audit import (
    AuditEvent,
    AuditEventSeverity,
    AuditEventType,
    AuditLogQuery,
    AuditLogSummary,
)
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/audit", tags=["Audit & Governance"])


@router.get("/logs", response_model=List[AuditEvent])
def get_audit_logs(
    org_id: str = Query("default-org", description="Organization Tenant ID"),
    user_role: str = Query("Administrator", description="Requester Role"),
    event_type: Optional[AuditEventType] = Query(None, description="Filter by event type"),
    severity: Optional[AuditEventSeverity] = Query(None, description="Filter by severity"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    Retrieves immutable audit logs for the specified organization.
    Protected by RBAC: Requires 'view_audit_logs' permission (Manager or Administrator).
    """
    if not check_role_permission(user_role, "view_audit_logs"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user_role}' does not have permission to inspect organization audit logs."
        )

    clean_org = sanitize_org_id(org_id)
    query = AuditLogQuery(
        org_id=clean_org,
        event_type=event_type,
        severity=severity,
        user_id=user_id,
        resource_type=resource_type,
        limit=limit,
        offset=offset
    )
    return audit_service.query_events(query)


@router.get("/summary", response_model=AuditLogSummary)
def get_audit_summary(
    org_id: str = Query("default-org", description="Organization Tenant ID"),
    user_role: str = Query("Administrator", description="Requester Role")
):
    """
    Returns an aggregated breakdown of security events, workflow transitions,
    and recent compliance alerts for the tenant.
    """
    if not check_role_permission(user_role, "view_audit_logs"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user_role}' does not have permission to view audit summaries."
        )

    clean_org = sanitize_org_id(org_id)
    return audit_service.get_summary(clean_org)

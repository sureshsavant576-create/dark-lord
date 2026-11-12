from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.app.core.auth import (
    UserContext,
    UserRole as AuthUserRole,
    get_current_user,
    verify_tenant_access,
)
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
    user_role: Optional[str] = Query(None, description="Requester Role"),
    event_type: Optional[AuditEventType] = Query(None, description="Filter by event type"),
    severity: Optional[AuditEventSeverity] = Query(None, description="Filter by severity"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: UserContext = Depends(get_current_user)
):
    """
    Retrieves immutable audit logs for the specified organization.
    Protected by RBAC and strict multi-tenant boundary checks.
    """
    clean_org = sanitize_org_id(org_id)

    # Multi-tenant data isolation: Block reading other tenants' audit logs
    verify_tenant_access(user, clean_org)

    role_to_check = user_role or user.role.value
    role_allowed = (
        user.role != AuthUserRole.DEVELOPER
        and (
            check_role_permission(role_to_check, "view_audit_logs")
            or user.role in (AuthUserRole.ADMIN, AuthUserRole.COMPLIANCE_LEAD)
        )
    )
    if not role_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role_to_check}' does not have permission to inspect organization audit logs."
        )

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
    user_role: Optional[str] = Query(None, description="Requester Role"),
    user: UserContext = Depends(get_current_user)
):
    """
    Returns an aggregated breakdown of security events and compliance alerts.
    Protected by RBAC and tenant isolation.
    """
    clean_org = sanitize_org_id(org_id)

    verify_tenant_access(user, clean_org)

    role_to_check = user_role or user.role.value
    role_allowed = (
        user.role != AuthUserRole.DEVELOPER
        and (
            check_role_permission(role_to_check, "view_audit_logs")
            or user.role in (AuthUserRole.ADMIN, AuthUserRole.COMPLIANCE_LEAD)
        )
    )
    if not role_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role_to_check}' does not have permission to view audit summaries."
        )

    return audit_service.get_summary(clean_org)

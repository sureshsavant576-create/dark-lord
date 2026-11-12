from __future__ import annotations
import logging
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.core.auth import (
    UserContext,
    UserRole,
    auth_service,
    get_current_user,
    is_platform_demo_admin,
    require_authenticated_user,
    verify_tenant_access,
)
from backend.app.core.org_service import (
    OrganizationRecord,
    TeamInvitation,
    map_team_role_to_auth_role,
    org_service,
)
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.services.brand_service import brand_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs", tags=["Company Registration & Administration"])


class CompanyRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2)
    org_slug: Optional[str] = None
    industry: str = Field(default="Technology")
    business_description: str = Field(default="")
    website: Optional[str] = ""
    primary_domain: Optional[str] = ""
    logo_url: Optional[str] = ""
    admin_name: Optional[str] = None
    admin_email: str
    admin_password: str = Field(..., min_length=8)


class CompanyRegisterResponse(BaseModel):
    organization: OrganizationRecord
    user_id: str
    email: str
    full_name: Optional[str] = None
    role: str
    role_label: str
    org_id: str
    session_token: str


class OrganizationUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    industry: Optional[str] = None
    business_description: Optional[str] = None
    website: Optional[str] = None
    primary_domain: Optional[str] = None
    logo_url: Optional[str] = None
    primary_colors: Optional[List[str]] = None
    subscription_tier: Optional[str] = None
    ai_provider_preference: Optional[str] = None
    api_webhook_url: Optional[str] = None


class CreateInvitationRequest(BaseModel):
    email: str
    role: str = "Creator"  # Creator | Manager | Authorised Reviewer | Developer | Administrator
    department: str = "Marketing"


class AcceptInvitationRequest(BaseModel):
    invite_code: str
    email: str
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UpdateUserRoleRequest(BaseModel):
    role: str
    department: Optional[str] = None


@router.post("/register", response_model=CompanyRegisterResponse)
def register_company(request: CompanyRegisterRequest, background_tasks: BackgroundTasks):
    """
    Area 1 Onboarding: Registers a brand-new company and creates its isolated organisation,
    assigning the founder/creator as Administrator of that new organisation only.
    Also initializes an isolated default BrandProfile for the new organisation.
    """
    org_rec, owner_rec, token = org_service.register_company_and_owner(
        company_name=request.company_name,
        org_slug=request.org_slug,
        industry=request.industry,
        business_description=request.business_description,
        admin_email=request.admin_email,
        admin_password=request.admin_password,
        admin_name=request.admin_name,
        website=request.website or "",
        primary_domain=request.primary_domain or "",
        logo_url=request.logo_url or "",
    )

    from backend.app.services.supabase_service import supabase_service
    background_tasks.add_task(supabase_service.save_organization, org_rec)
    background_tasks.add_task(
        supabase_service.register_supabase_user,
        owner_rec.email,
        request.admin_password,
        "Administrator",
        org_rec.org_id,
        owner_rec.full_name,
    )

    # Create initial isolated BrandProfile so the company is immediately ready for Brand DNA & Review
    try:
        if not brand_service.get_brand_profile(org_rec.org_id):
            brand_service.save_brand_profile(
                BrandProfile(
                    brand_id=org_rec.org_id,
                    brand_name=org_rec.company_name,
                    owner_id=org_rec.org_id,
                    org_id=org_rec.org_id,
                    status=ProfileStatus.DRAFT_PENDING_CONFIRMATION,
                    logo_url=org_rec.logo_url or "",
                    mission_statement=org_rec.business_description or f"{org_rec.company_name} official brand governance profile.",
                    target_audience="Enterprise & Consumer Customers",
                )
            )
    except Exception as exc:
        logger.warning("Could not pre-create BrandProfile for %s: %s", org_rec.org_id, exc)

    return CompanyRegisterResponse(
        organization=org_rec,
        user_id=owner_rec.user_id,
        email=owner_rec.email,
        full_name=owner_rec.full_name,
        role=owner_rec.role.value,
        role_label=owner_rec.role_label or "Administrator",
        org_id=org_rec.org_id,
        session_token=token,
    )


@router.get("/my", response_model=List[OrganizationRecord])
def list_accessible_organizations(user: UserContext = Depends(get_current_user)):
    """
    Lists organizations scoped strictly to the authenticated user's company.
    Platform demo judge account sees demo tenants; real company users only see their own company.
    """
    if is_platform_demo_admin(user) or user.org_id == "default-org":
        return org_service.list_organizations(is_super_admin=True)
    return org_service.list_organizations(allowed_org_id=user.org_id, is_super_admin=False)


@router.get("/current", response_model=OrganizationRecord)
def get_current_organization(
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(get_current_user),
):
    target_org = org_id or user.org_id or "default-org"
    verify_tenant_access(user, target_org)
    rec = org_service.get_organization(target_org)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Organisation '{target_org}' not found.")
    return rec


@router.put("/current", response_model=OrganizationRecord)
def update_current_organization(
    payload: OrganizationUpdateRequest,
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(require_authenticated_user),
):
    """
    Updates organization profile and/or technical configuration.
    Company Administrator can edit full company profile & settings.
    Developer role can ONLY modify technical integration fields (ai_provider_preference, api_webhook_url).
    """
    target_org = org_id or user.org_id
    verify_tenant_access(user, target_org)

    if user.role not in (UserRole.ADMIN, UserRole.DEVELOPER):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Company Administrators or Authorised Developers can update organisation configuration."
        )

    is_dev_only = user.role == UserRole.DEVELOPER
    return org_service.update_organization(
        org_id=target_org,
        updates=payload.model_dump(exclude_none=True),
        is_developer_only=is_dev_only,
    )


@router.get("/users")
def list_organization_users(
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(require_authenticated_user),
):
    """
    Lists employees & developers belonging strictly to this organisation.
    Requires Administrator or Compliance Lead (Manager/Authorised Reviewer).
    """
    target_org = org_id or user.org_id
    verify_tenant_access(user, target_org)
    if user.role not in (UserRole.ADMIN, UserRole.COMPLIANCE_LEAD):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Team member directory management requires Administrator or Manager privileges."
        )
    return auth_service.list_org_users(target_org)


@router.put("/users/{target_user_id}/role")
def assign_user_role(
    target_user_id: str,
    payload: UpdateUserRoleRequest,
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(require_authenticated_user),
):
    target_org = org_id or user.org_id
    verify_tenant_access(user, target_org)
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Forbidden: Only Company Administrators can assign user roles.")

    auth_role, role_label = map_team_role_to_auth_role(payload.role)
    return auth_service.update_user_role(
        target_user_id=target_user_id,
        org_id=target_org,
        new_role=auth_role,
        new_role_label=role_label,
        new_department=payload.department,
    )


@router.post("/invitations", response_model=TeamInvitation)
def invite_team_member(
    payload: CreateInvitationRequest,
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(require_authenticated_user),
):
    """
    Invites an employee (Creator, Manager, Authorised Reviewer) or Developer into this organisation.
    """
    target_org = org_id or user.org_id
    verify_tenant_access(user, target_org)
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Forbidden: Only Company Administrators can invite employees or developers.")

    return org_service.create_invitation(
        org_id=target_org,
        email=payload.email,
        role_label=payload.role,
        department=payload.department,
        invited_by=user.email or user.user_id,
    )


@router.get("/invitations", response_model=List[TeamInvitation])
def list_team_invitations(
    org_id: Optional[str] = Query(default=None),
    user: UserContext = Depends(require_authenticated_user),
):
    target_org = org_id or user.org_id
    verify_tenant_access(user, target_org)
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Forbidden: Only Company Administrators can view team invitations.")
    return org_service.list_invitations(target_org)


@router.post("/invitations/accept")
def accept_team_invitation(payload: AcceptInvitationRequest, background_tasks: BackgroundTasks):
    """
    Allows an invited employee or developer to join the inviting company organisation using their invite code.
    """
    inv, user_rec, token = org_service.accept_invitation(
        invite_code=payload.invite_code,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
    )
    from backend.app.services.supabase_service import supabase_service
    background_tasks.add_task(
        supabase_service.register_supabase_user,
        user_rec.email,
        payload.password,
        user_rec.role_label or inv.role,
        user_rec.org_id,
        user_rec.full_name,
    )
    return {
        "status": "accepted",
        "organization_id": inv.org_id,
        "user_id": user_rec.user_id,
        "email": user_rec.email,
        "full_name": user_rec.full_name,
        "role": user_rec.role.value,
        "role_label": user_rec.role_label or inv.role,
        "department": user_rec.department,
        "org_id": user_rec.org_id,
        "session_token": token,
    }

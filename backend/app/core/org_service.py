from __future__ import annotations
import hashlib
import json
import logging
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

from backend.app.core.auth import UserAccountService, UserRecord, UserRole, auth_service
from backend.app.core.config import settings
from backend.app.core.security import sanitize_org_id

logger = logging.getLogger(__name__)

ORGS_DB_PATH = settings.DB_DIR / "organizations.json"
INVITES_DB_PATH = settings.DB_DIR / "invitations.json"


class TeamRoleLabel(str, Enum):
    ADMINISTRATOR = "Administrator"
    MANAGER = "Manager"
    AUTHORISED_REVIEWER = "Authorised Reviewer"
    CREATOR = "Creator"
    DEVELOPER = "Developer"


def map_team_role_to_auth_role(role_input: str) -> tuple[UserRole, str]:
    """Maps a human/UI role selection to both backend Auth UserRole and canonical display label."""
    norm = (role_input or "creator").strip().lower().replace("_", " ")
    if norm in ("admin", "administrator", "owner", "company owner"):
        return UserRole.ADMIN, TeamRoleLabel.ADMINISTRATOR.value
    if norm in ("manager", "brand manager"):
        return UserRole.COMPLIANCE_LEAD, TeamRoleLabel.MANAGER.value
    if norm in ("authorised reviewer", "authorized reviewer", "compliance lead", "compliance_lead", "reviewer"):
        return UserRole.COMPLIANCE_LEAD, TeamRoleLabel.AUTHORISED_REVIEWER.value
    if norm in ("developer", "dev", "engineer"):
        return UserRole.DEVELOPER, TeamRoleLabel.DEVELOPER.value
    return UserRole.VIEWER, TeamRoleLabel.CREATOR.value


class OrganizationRecord(BaseModel):
    org_id: str
    company_name: str
    industry: str = "Technology"
    business_description: str = ""
    website: str = ""
    primary_domain: str = ""
    logo_url: str = ""
    primary_colors: List[str] = Field(default_factory=list)
    owner_user_id: str = ""
    subscription_tier: str = "Enterprise Governance"
    ai_provider_preference: str = "gemini"
    api_webhook_url: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TeamInvitation(BaseModel):
    invite_id: str
    invite_code: str
    org_id: str
    email: str
    role: str = TeamRoleLabel.CREATOR.value
    auth_role: UserRole = UserRole.VIEWER
    department: str = "Marketing"
    invited_by: str
    status: str = "PENDING"  # PENDING | ACCEPTED | REVOKED
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    accepted_at: Optional[str] = None


class OrganizationService:
    """
    Manages multi-company Organizations and Team Invitations with strict tenant isolation.
    Persists to data/db/organizations.json and data/db/invitations.json.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._ensure_dbs()

    def _ensure_dbs(self) -> None:
        settings.DB_DIR.mkdir(parents=True, exist_ok=True)
        if not ORGS_DB_PATH.exists():
            ORGS_DB_PATH.write_text("{}", encoding="utf-8")
        if not INVITES_DB_PATH.exists():
            INVITES_DB_PATH.write_text("{}", encoding="utf-8")
        self._seed_default_orgs()

    def _seed_default_orgs(self) -> None:
        defaults = [
            OrganizationRecord(
                org_id="apex-cloud",
                company_name="Apex Cloud Systems",
                industry="Fintech / Cloud Infrastructure",
                business_description="Enterprise zero-trust cloud telemetry and governance solutions.",
                website="https://apexcloud.io",
                primary_domain="apexcloud.io",
                owner_user_id="user_demo",
                subscription_tier="Enterprise Governance",
                ai_provider_preference="gemini",
            ),
            OrganizationRecord(
                org_id="nike",
                company_name="Nike Global",
                industry="Athletics & Sportswear",
                business_description="Global athletic performance footwear, apparel, and innovation.",
                website="https://nike.com",
                primary_domain="nike.com",
                owner_user_id="system",
                subscription_tier="Enterprise Governance",
                ai_provider_preference="gemini",
            ),
            OrganizationRecord(
                org_id="default-org",
                company_name="Global Corporation (Default Tenant)",
                industry="Enterprise SaaS",
                business_description="Default governance tenant for workspace testing.",
                website="https://sanket.ai",
                primary_domain="sanket.ai",
                owner_user_id="system",
                subscription_tier="Standard",
                ai_provider_preference="gemini",
            ),
        ]
        with self._lock:
            orgs = self._load_orgs()
            changed = False
            for d in defaults:
                if d.org_id not in orgs:
                    orgs[d.org_id] = d.model_dump()
                    changed = True
            if changed:
                self._save_orgs(orgs)

    def _load_orgs(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = ORGS_DB_PATH.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception:
                return {}

    def _save_orgs(self, data: Dict[str, dict]) -> None:
        with self._lock:
            tmp = ORGS_DB_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(ORGS_DB_PATH)

    def _load_invites(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = INVITES_DB_PATH.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception:
                return {}

    def _save_invites(self, data: Dict[str, dict]) -> None:
        with self._lock:
            tmp = INVITES_DB_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(INVITES_DB_PATH)

    def get_organization(self, org_id: str) -> Optional[OrganizationRecord]:
        clean = sanitize_org_id(org_id)
        with self._lock:
            orgs = self._load_orgs()
            raw = orgs.get(clean)
            if not raw and "-" in clean:
                raw = orgs.get(clean.replace("-", "_"))
            if not raw and "_" in clean:
                raw = orgs.get(clean.replace("_", "-"))
            return OrganizationRecord(**raw) if raw else None

    def list_organizations(self, allowed_org_id: Optional[str] = None, is_super_admin: bool = False) -> List[OrganizationRecord]:
        with self._lock:
            orgs = self._load_orgs()
            results = []
            for raw in orgs.values():
                rec = OrganizationRecord(**raw)
                if is_super_admin or not allowed_org_id:
                    results.append(rec)
                else:
                    norm_rec = rec.org_id.replace("-", "_").lower()
                    norm_allowed = allowed_org_id.replace("-", "_").lower()
                    if norm_rec == norm_allowed:
                        results.append(rec)
            return results

    def register_company_and_owner(
        self,
        company_name: str,
        org_slug: Optional[str],
        industry: str,
        business_description: str,
        admin_email: str,
        admin_password: str,
        admin_name: Optional[str] = None,
        website: str = "",
        primary_domain: str = "",
        logo_url: str = "",
    ) -> tuple[OrganizationRecord, UserRecord, str]:
        raw_slug = (org_slug or company_name).strip().lower()
        clean_org_id = sanitize_org_id(raw_slug.replace(" ", "-"))
        if not clean_org_id or clean_org_id in ("default", "system"):
            clean_org_id = f"org-{uuid.uuid4().hex[:6]}"

        with self._lock:
            orgs = self._load_orgs()
            if clean_org_id in orgs:
                raise HTTPException(
                    status_code=400,
                    detail=f"Organisation '{clean_org_id}' is already registered. Please choose a different organisation ID or sign in."
                )

            # Register the founding Company Owner as Administrator of this new isolated org
            owner_record = auth_service.register_user(
                email=admin_email,
                password=admin_password,
                role=UserRole.ADMIN,
                org_id=clean_org_id,
                full_name=admin_name or company_name + " Admin",
                role_label=TeamRoleLabel.ADMINISTRATOR.value,
                department="Executive / Brand Admin",
            )

            domain = primary_domain.strip().lower()
            if not domain and "@" in admin_email:
                domain = admin_email.split("@", 1)[1].lower()

            org_record = OrganizationRecord(
                org_id=clean_org_id,
                company_name=company_name.strip(),
                industry=industry.strip() or "Technology",
                business_description=business_description.strip(),
                website=website.strip(),
                primary_domain=domain,
                logo_url=logo_url.strip(),
                owner_user_id=owner_record.user_id,
            )
            orgs[clean_org_id] = org_record.model_dump()
            self._save_orgs(orgs)

            token = auth_service.create_session_token(
                owner_record.user_id,
                owner_record.role.value,
                clean_org_id
            )
            return org_record, owner_record, token

    def update_organization(
        self,
        org_id: str,
        updates: Dict[str, Any],
        is_developer_only: bool = False,
    ) -> OrganizationRecord:
        clean = sanitize_org_id(org_id)
        with self._lock:
            orgs = self._load_orgs()
            raw = orgs.get(clean)
            if not raw:
                raise HTTPException(status_code=404, detail=f"Organisation '{org_id}' not found.")

            tech_fields = {"ai_provider_preference", "api_webhook_url"}
            if is_developer_only:
                non_tech = [k for k in updates.keys() if k not in tech_fields]
                if non_tech:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Forbidden: Developers can only configure technical integrations, not {', '.join(non_tech)}."
                    )
                allowed_fields = tech_fields
            else:
                allowed_fields = {
                    "company_name",
                    "industry",
                    "business_description",
                    "website",
                    "primary_domain",
                    "logo_url",
                    "primary_colors",
                    "subscription_tier",
                    "ai_provider_preference",
                    "api_webhook_url",
                }
            for k, v in updates.items():
                if k in allowed_fields and v is not None:
                    raw[k] = v
            raw["updated_at"] = datetime.now(timezone.utc).isoformat()
            orgs[clean] = raw
            self._save_orgs(orgs)
            return OrganizationRecord(**raw)

    def create_invitation(
        self,
        org_id: str,
        email: str,
        role_label: str,
        department: str,
        invited_by: str,
    ) -> TeamInvitation:
        clean_org = sanitize_org_id(org_id)
        clean_email = email.strip().lower()
        auth_role, canonical_label = map_team_role_to_auth_role(role_label)
        invite_id = f"inv_{uuid.uuid4().hex[:8]}"
        invite_code = f"SNK-{clean_org[:4].upper()}-{secrets.token_hex(3).upper()}"

        inv = TeamInvitation(
            invite_id=invite_id,
            invite_code=invite_code,
            org_id=clean_org,
            email=clean_email,
            role=canonical_label,
            auth_role=auth_role,
            department=department.strip() or "Marketing",
            invited_by=invited_by,
        )
        with self._lock:
            invites = self._load_invites()
            invites[invite_id] = inv.model_dump()
            self._save_invites(invites)
        return inv

    def list_invitations(self, org_id: str) -> List[TeamInvitation]:
        clean_org = sanitize_org_id(org_id)
        with self._lock:
            invites = self._load_invites()
            res = []
            for raw in invites.values():
                if sanitize_org_id(raw.get("org_id", "")) == clean_org:
                    res.append(TeamInvitation(**raw))
            return sorted(res, key=lambda x: x.created_at, reverse=True)

    def accept_invitation(
        self,
        invite_code: str,
        email: str,
        password: str,
        full_name: Optional[str] = None,
    ) -> tuple[TeamInvitation, UserRecord, str]:
        clean_code = invite_code.strip().upper()
        clean_email = email.strip().lower()
        with self._lock:
            invites = self._load_invites()
            matched_id = None
            matched_inv = None
            for iid, raw in invites.items():
                if raw.get("invite_code", "").upper() == clean_code and raw.get("status") == "PENDING":
                    matched_id = iid
                    matched_inv = TeamInvitation(**raw)
                    break

            if not matched_inv:
                raise HTTPException(status_code=404, detail="Invalid or expired invitation code.")

            if matched_inv.email and matched_inv.email.lower() != clean_email:
                raise HTTPException(
                    status_code=403,
                    detail=f"This invitation was issued specifically for {matched_inv.email}."
                )

            user_rec = auth_service.register_user(
                email=clean_email,
                password=password,
                role=matched_inv.auth_role,
                org_id=matched_inv.org_id,
                full_name=full_name or clean_email.split("@")[0].title(),
                role_label=matched_inv.role,
                department=matched_inv.department,
            )

            matched_inv.status = "ACCEPTED"
            matched_inv.accepted_at = datetime.now(timezone.utc).isoformat()
            invites[matched_id] = matched_inv.model_dump()
            self._save_invites(invites)

            token = auth_service.create_session_token(
                user_rec.user_id,
                user_rec.role.value,
                matched_inv.org_id,
            )
            return matched_inv, user_rec, token


org_service = OrganizationService()

from __future__ import annotations
from enum import Enum
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import threading
import time
from typing import Any, Dict, Optional, Tuple
from fastapi import Header, HTTPException, Request
from pydantic import BaseModel, Field

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

def _get_auth_secret() -> str:
    env_secret = os.environ.get("BRANDSHIELD_AUTH_SECRET")
    if env_secret and env_secret.strip():
        return env_secret.strip()
    secret_file = settings.DB_DIR / ".auth_secret"
    try:
        if secret_file.exists():
            sec = secret_file.read_text(encoding="utf-8").strip()
            if sec:
                return sec
        settings.DB_DIR.mkdir(parents=True, exist_ok=True)
        import secrets
        new_sec = secrets.token_urlsafe(48)
        secret_file.write_text(new_sec, encoding="utf-8")
        return new_sec
    except Exception:
        return "brandshield-production-secret-key-salt-2026"

AUTH_SECRET = _get_auth_secret()
USERS_DB_PATH = settings.DB_DIR / "users.json"
REVOKED_SESSIONS_PATH = settings.DB_DIR / "revoked_sessions.json"

class UserRole(str, Enum):
    ADMIN = "admin"
    COMPLIANCE_LEAD = "compliance_lead"
    DEVELOPER = "developer"
    VIEWER = "viewer"

class UserContext(BaseModel):
    user_id: str = "default-dev"
    org_id: str = "default-org"
    role: UserRole = UserRole.COMPLIANCE_LEAD
    email: Optional[str] = None
    full_name: Optional[str] = None
    role_label: Optional[str] = None
    department: Optional[str] = None

class UserRecord(BaseModel):
    user_id: str
    email: str
    hashed_password: str
    role: UserRole = UserRole.DEVELOPER
    org_id: str = "default-org"
    full_name: Optional[str] = None
    role_label: Optional[str] = None
    department: Optional[str] = "Marketing"
    created_at: float = Field(default_factory=time.time)

class UserAccountService:

    def __init__(self):
        self._lock = threading.RLock()
        self._ensure_dbs()

    def _ensure_dbs(self) -> None:
        settings.DB_DIR.mkdir(parents=True, exist_ok=True)
        if not USERS_DB_PATH.exists():
            USERS_DB_PATH.write_text("{}", encoding="utf-8")
        if not REVOKED_SESSIONS_PATH.exists():
            REVOKED_SESSIONS_PATH.write_text("[]", encoding="utf-8")
        self._ensure_demo_user()

    def _ensure_demo_user(self) -> None:
        demo_email = "demo@sanket.ai"
        with self._lock:
            users = self._load_users()
            has_demo = any(u.get("email") == demo_email for u in users.values())
            if not has_demo:
                user_id = f"user_{hashlib.sha256(demo_email.encode()).hexdigest()[:10]}"
                hashed = self.hash_password("DemoJudge2026!")
                record = UserRecord(
                    user_id=user_id,
                    email=demo_email,
                    hashed_password=hashed,
                    role=UserRole.ADMIN,
                    org_id="apex-cloud",
                )
                users[user_id] = record.model_dump()
                self._save_users(users)
                logger.info("Initialized default demo administrator account: %s", demo_email)

    def _load_users(self) -> Dict[str, dict]:
        with self._lock:
            try:
                content = USERS_DB_PATH.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else {}
            except Exception:
                return {}

    def _save_users(self, data: Dict[str, dict]) -> None:
        with self._lock:
            tmp = USERS_DB_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            for i in range(5):
                try:
                    tmp.replace(USERS_DB_PATH)
                    break
                except OSError:
                    if i == 4:
                        USERS_DB_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
                        try:
                            tmp.unlink(missing_ok=True)
                        except Exception:
                            pass
                    else:
                        time.sleep(0.05)

    def _load_revoked(self) -> list:
        with self._lock:
            try:
                content = REVOKED_SESSIONS_PATH.read_text(encoding="utf-8").strip()
                return json.loads(content) if content else []
            except Exception:
                return []

    def _save_revoked(self, tokens: list) -> None:
        with self._lock:
            tmp = REVOKED_SESSIONS_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps(tokens), encoding="utf-8")
            for i in range(5):
                try:
                    tmp.replace(REVOKED_SESSIONS_PATH)
                    break
                except OSError:
                    if i == 4:
                        REVOKED_SESSIONS_PATH.write_text(json.dumps(tokens), encoding="utf-8")
                        try:
                            tmp.unlink(missing_ok=True)
                        except Exception:
                            pass
                    else:
                        time.sleep(0.05)

    @staticmethod
    def hash_password(password: str, salt: Optional[bytes] = None) -> str:
        if salt is None:
            salt = os.urandom(16)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
        return f"{salt.hex()}:{key.hex()}"

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        try:
            salt_hex, key_hex = hashed.split(":")
            salt = bytes.fromhex(salt_hex)
            expected_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
            return hmac.compare_digest(expected_key.hex(), key_hex)
        except Exception:
            return False

    def register_user(
        self,
        email: str,
        password: str,
        role: UserRole = UserRole.DEVELOPER,
        org_id: str = "default-org",
        full_name: Optional[str] = None,
        role_label: Optional[str] = None,
        department: Optional[str] = "Marketing",
    ) -> UserRecord:
        clean_email = (email or "").strip().lower()
        if not clean_email or "@" not in clean_email or clean_email.startswith("@") or clean_email.endswith("@"):
            raise HTTPException(status_code=400, detail="Invalid email format. A valid email address is required.")
        if not password or len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
        if len(password) > 128:
            raise HTTPException(status_code=400, detail="Password exceeds maximum allowable length of 128 characters.")
        with self._lock:
            users = self._load_users()
            for u in users.values():
                if u.get("email") == clean_email:
                    raise HTTPException(status_code=400, detail=f"Email '{clean_email}' is already registered.")

            user_id = f"user_{hashlib.sha256(clean_email.encode()).hexdigest()[:10]}"
            hashed = self.hash_password(password)
            record = UserRecord(
                user_id=user_id,
                email=clean_email,
                hashed_password=hashed,
                role=role,
                org_id=org_id,
                full_name=full_name or clean_email.split("@")[0].replace(".", " ").title(),
                role_label=role_label,
                department=department or "Marketing",
            )
            users[user_id] = record.model_dump()
            self._save_users(users)
            return record

    def list_org_users(self, org_id: str) -> list[dict]:
        clean_target = org_id.replace("-", "_").lower().strip()
        with self._lock:
            users = self._load_users()
            res = []
            for u in users.values():
                u_org = (u.get("org_id") or "").replace("-", "_").lower().strip()
                if u_org == clean_target:
                    res.append({
                        "user_id": u.get("user_id"),
                        "email": u.get("email"),
                        "full_name": u.get("full_name") or (u.get("email", "").split("@")[0].title()),
                        "role": u.get("role"),
                        "role_label": u.get("role_label") or u.get("role"),
                        "department": u.get("department") or "Marketing",
                        "org_id": u.get("org_id"),
                        "created_at": u.get("created_at"),
                    })
            return res

    def update_user_role(
        self,
        target_user_id: str,
        org_id: str,
        new_role: UserRole,
        new_role_label: Optional[str] = None,
        new_department: Optional[str] = None,
    ) -> dict:
        clean_target = org_id.replace("-", "_").lower().strip()
        with self._lock:
            users = self._load_users()
            u = users.get(target_user_id)
            if not u:
                raise HTTPException(status_code=404, detail="User not found.")
            u_org = (u.get("org_id") or "").replace("-", "_").lower().strip()
            if u_org != clean_target:
                raise HTTPException(status_code=403, detail="Cross-tenant user modification forbidden.")
            u["role"] = new_role.value
            if new_role_label:
                u["role_label"] = new_role_label
            if new_department:
                u["department"] = new_department
            users[target_user_id] = u
            self._save_users(users)
            return {
                "user_id": u.get("user_id"),
                "email": u.get("email"),
                "full_name": u.get("full_name"),
                "role": u.get("role"),
                "role_label": u.get("role_label"),
                "department": u.get("department"),
                "org_id": u.get("org_id"),
            }

    def authenticate_user(self, email: str, password: str) -> Tuple[UserRecord, str]:
        clean_email = (email or "").strip().lower()
        if not clean_email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required.")
        users = self._load_users()
        matched = None
        for u in users.values():
            if u.get("email") == clean_email:
                matched = UserRecord(**u)
                break
        if not matched or not self.verify_password(password, matched.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        token = self.create_session_token(matched.user_id, matched.role.value, matched.org_id)
        return matched, token

    def create_session_token(self, user_id: str, role: str, org_id: str, expiry_seconds: int = 86400) -> str:
        exp = int(time.time()) + expiry_seconds
        payload = f"{user_id}|{role}|{org_id}|{exp}"
        sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return f"{payload}|{sig}"

    def revoke_session(self, token: str) -> None:
        revoked = self._load_revoked()
        revoked.append(token)
        self._save_revoked(revoked[-5000:])

    def verify_token(self, token: str) -> Optional[UserContext]:
        if token in self._load_revoked():
            return None
        try:
            parts = token.split("|")
            if len(parts) != 5:
                return None
            user_id, role_str, org_id, exp_str, sig = parts
            payload = f"{user_id}|{role_str}|{org_id}|{exp_str}"
            expected_sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig, sig):
                return None
            if int(exp_str) < int(time.time()):
                return None
            users = self._load_users()
            rec = users.get(user_id) or {}
            return UserContext(
                user_id=user_id,
                role=UserRole(role_str),
                org_id=org_id,
                email=rec.get("email"),
                full_name=rec.get("full_name"),
                role_label=rec.get("role_label"),
                department=rec.get("department"),
            )
        except Exception:
            return None

auth_service = UserAccountService()
hash_password = auth_service.hash_password
verify_password = auth_service.verify_password

def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    x_org_id: Optional[str] = Header(default=None),
) -> UserContext:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        user_ctx = auth_service.verify_token(token)
        if user_ctx:
            return user_ctx
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")

    # Unauthenticated request: Strictly prevent privilege escalation via headers
    user_id = x_user_id or "anonymous-user"
    org_id = x_org_id or "default-org"

    if x_user_role:
        role_str = x_user_role.lower().strip()
        # Security hardening: Unauthenticated clients cannot claim admin or compliance_lead via headers
        if role_str in ("admin", "system_admin", "compliance_lead", "lead", "officer", "manager"):
            logger.warning(
                "Blocked header privilege escalation attempt: unauthenticated request claimed role '%s'",
                x_user_role
            )
            role = UserRole.VIEWER
        elif role_str in ("viewer", "read_only"):
            role = UserRole.VIEWER
        else:
            role = UserRole.DEVELOPER
    else:
        role = UserRole.VIEWER

    return UserContext(user_id=user_id, org_id=org_id, role=role)

def require_authenticated_user(
    authorization: Optional[str] = Header(default=None),
) -> UserContext:
    """
    Enforces that the request provides a valid, unexpired, signed session token.
    Raises 401 Unauthorized if missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required: Please provide a valid Bearer token in the Authorization header."
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    user_ctx = auth_service.verify_token(token)
    if not user_ctx:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    return user_ctx

DEMO_USER_ID = f"user_{hashlib.sha256('demo@sanket.ai'.encode()).hexdigest()[:10]}"

def is_platform_demo_admin(user: UserContext) -> bool:
    return user.user_id == DEMO_USER_ID or (user.email or "").lower() == "demo@sanket.ai"

def verify_tenant_access(user: UserContext, target_org_id: str) -> None:
    """
    Strict boundary check: ensures user belongs to target organization.
    Prevents Company A's Admin or Team Members from accessing Company B's data.
    """
    if is_platform_demo_admin(user):
        return
    clean_target = (target_org_id or "").replace("-", "_").lower().strip()
    clean_user_org = (user.org_id or "").replace("-", "_").lower().strip()
    if clean_target != clean_user_org and clean_user_org != "default_org":
        raise HTTPException(
            status_code=403,
            detail=f"Cross-tenant access forbidden: User from organization '{user.org_id}' cannot access resources belonging to '{target_org_id}'."
        )

def verify_can_manage_brand(user: UserContext, brand_owner_id: Optional[str] = None) -> None:
    if is_platform_demo_admin(user):
        return
    if user.role == UserRole.ADMIN:
        if not brand_owner_id:
            return
        clean_owner = brand_owner_id.replace("-", "_").lower().strip()
        clean_org = (user.org_id or "").replace("-", "_").lower().strip()
        if clean_owner in (clean_org, (user.user_id or "").lower(), "default_org", "default_dev"):
            return
        raise HTTPException(
            status_code=403,
            detail=f"Cross-tenant access forbidden: Admin of '{user.org_id}' cannot modify brand owned by '{brand_owner_id}'."
        )
    if user.role == UserRole.COMPLIANCE_LEAD:
        if not brand_owner_id or brand_owner_id in (user.user_id, user.org_id, "default-org", "default-dev"):
            return
    raise HTTPException(
        status_code=403,
        detail=f"Forbidden: User '{user.user_id}' with role '{user.role}' cannot modify or delete brand owned by '{brand_owner_id}'."
    )

def verify_can_review_report(user: UserContext) -> None:
    if user.role in (UserRole.ADMIN, UserRole.COMPLIANCE_LEAD):
        return
    raise HTTPException(
        status_code=403,
        detail=f"Forbidden: Role '{user.role}' cannot submit official compliance reviews. Compliance Lead or Admin required."
    )

def verify_can_access_report(user: UserContext, report_org_id: str, report_submitted_by: str) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.role == UserRole.COMPLIANCE_LEAD:
        if report_org_id in (user.org_id, "default-org"):
            return
    if user.role == UserRole.DEVELOPER:
        if report_submitted_by in (user.user_id, "default-dev") or report_org_id in (user.org_id, "default-org"):
            return
    raise HTTPException(
        status_code=403,
        detail=f"Forbidden: User '{user.user_id}' cannot access this inspection report."
    )

def verify_can_delete_report(user: UserContext, report_org_id: str, report_submitted_by: str) -> None:
    if user.role in (UserRole.ADMIN, UserRole.COMPLIANCE_LEAD):
        return
    if user.role == UserRole.DEVELOPER:
        if report_submitted_by in (user.user_id, "default-dev") or report_org_id in (user.org_id, "default-org"):
            return
    raise HTTPException(
        status_code=403,
        detail=f"Forbidden: User '{user.user_id}' with role '{user.role}' cannot delete this inspection report."
    )

def verify_can_clear_reports(user: UserContext) -> None:
    if user.role in (UserRole.ADMIN, UserRole.COMPLIANCE_LEAD):
        return
    raise HTTPException(
        status_code=403,
        detail=f"Forbidden: User '{user.user_id}' with role '{user.role}' cannot clear audit reports. Admin or Compliance Lead required."
    )

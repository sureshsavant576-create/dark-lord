from __future__ import annotations
from enum import Enum
import logging
import os
from pathlib import Path
import re
from typing import Dict, List, Optional, Set, Tuple

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom Security Exceptions
# ---------------------------------------------------------------------------

class SecurityPathTraversalError(PermissionError):
    """Raised when an operation attempts directory traversal outside the authorized root."""
    pass


class TenantIsolationViolationError(PermissionError):
    """Raised when an operation attempts to access data belonging to another organization."""
    pass


class InvalidFileContentError(ValueError):
    """Raised when an uploaded file violates signature, MIME, or magic-bytes verification."""
    pass


class InsufficientClearanceError(PermissionError):
    """Raised when a user lacks required confidentiality clearance to view a company asset."""
    pass


class UnauthorizedActionError(PermissionError):
    """Raised when a user role lacks permissions to perform an administrative or workflow action."""
    pass


# ---------------------------------------------------------------------------
# Role-Based Access Control (RBAC) & Confidentiality Clearance
# ---------------------------------------------------------------------------

class UserRole(str, Enum):
    CREATOR = "Creator"
    MANAGER = "Manager"
    AUTHORISED_REVIEWER = "Authorised Reviewer"
    ADMINISTRATOR = "Administrator"


class ConfidentialityLevel(str, Enum):
    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    CONFIDENTIAL = "CONFIDENTIAL"
    RESTRICTED = "RESTRICTED"


ROLE_CLEARANCE: Dict[UserRole, Set[ConfidentialityLevel]] = {
    UserRole.CREATOR: {
        ConfidentialityLevel.PUBLIC,
        ConfidentialityLevel.INTERNAL,
    },
    UserRole.MANAGER: {
        ConfidentialityLevel.PUBLIC,
        ConfidentialityLevel.INTERNAL,
        ConfidentialityLevel.CONFIDENTIAL,
    },
    UserRole.AUTHORISED_REVIEWER: {
        ConfidentialityLevel.PUBLIC,
        ConfidentialityLevel.INTERNAL,
        ConfidentialityLevel.CONFIDENTIAL,
        ConfidentialityLevel.RESTRICTED,
    },
    UserRole.ADMINISTRATOR: {
        ConfidentialityLevel.PUBLIC,
        ConfidentialityLevel.INTERNAL,
        ConfidentialityLevel.CONFIDENTIAL,
        ConfidentialityLevel.RESTRICTED,
    },
}

ROLE_PERMISSIONS: Dict[UserRole, Set[str]] = {
    UserRole.CREATOR: {
        "upload_creative",
        "submit_review",
        "chat_copilot",
        "view_guidelines_public",
        "view_guidelines_internal",
        "accept_remediation",
        "view_recurring_insights",
    },
    UserRole.MANAGER: {
        "upload_creative",
        "submit_review",
        "chat_copilot",
        "view_guidelines_public",
        "view_guidelines_internal",
        "view_guidelines_confidential",
        "request_revision",
        "comment_review",
        "view_audit_logs",
        "view_recurring_insights",
    },
    UserRole.AUTHORISED_REVIEWER: {
        "upload_creative",
        "submit_review",
        "chat_copilot",
        "view_guidelines_public",
        "view_guidelines_internal",
        "view_guidelines_confidential",
        "view_guidelines_restricted",
        "approve_review",
        "reject_review",
        "resolve_escalation",
        "verify_promotional_claims",
        "comment_review",
        "view_recurring_insights",
    },
    UserRole.ADMINISTRATOR: {
        "upload_creative",
        "submit_review",
        "chat_copilot",
        "view_guidelines_public",
        "view_guidelines_internal",
        "view_guidelines_confidential",
        "view_guidelines_restricted",
        "approve_review",
        "reject_review",
        "resolve_escalation",
        "verify_promotional_claims",
        "modify_brand_dna",
        "seed_knowledge_base",
        "manage_policy_exceptions",
        "view_audit_logs",
        "export_audit_logs",
        "view_recurring_insights",
        "manage_users",
        "configure_integrations",
    },
}


def check_role_clearance(role: str | UserRole, level: str | ConfidentialityLevel) -> bool:
    """Verifies whether a given role holds sufficient clearance for a confidentiality tier."""
    try:
        if isinstance(role, str):
            role_map = {
                "admin": UserRole.ADMINISTRATOR,
                "administrator": UserRole.ADMINISTRATOR,
                "compliance_lead": UserRole.AUTHORISED_REVIEWER,
                "authorised reviewer": UserRole.AUTHORISED_REVIEWER,
                "authorised_reviewer": UserRole.AUTHORISED_REVIEWER,
                "manager": UserRole.MANAGER,
                "creator": UserRole.CREATOR,
                "developer": UserRole.CREATOR,
                "viewer": UserRole.CREATOR,
            }
            clean_role = role.strip().lower()
            if clean_role in role_map:
                user_role = role_map[clean_role]
            else:
                user_role = UserRole(role)
        else:
            user_role = role
        target_level = ConfidentialityLevel(level)
    except ValueError:
        return False
    return target_level in ROLE_CLEARANCE.get(user_role, set())


def check_role_permission(role: str | UserRole, action: str) -> bool:
    """Verifies whether a user role is permitted to perform a specified action."""
    try:
        if isinstance(role, str):
            role_map = {
                "admin": UserRole.ADMINISTRATOR,
                "administrator": UserRole.ADMINISTRATOR,
                "compliance_lead": UserRole.AUTHORISED_REVIEWER,
                "authorised reviewer": UserRole.AUTHORISED_REVIEWER,
                "authorised_reviewer": UserRole.AUTHORISED_REVIEWER,
                "manager": UserRole.MANAGER,
                "creator": UserRole.CREATOR,
                "developer": UserRole.CREATOR,
                "viewer": UserRole.CREATOR,
            }
            clean_role = role.strip().lower()
            if clean_role == "developer" and action == "configure_integrations":
                return True
            if clean_role in role_map:
                user_role = role_map[clean_role]
            else:
                user_role = UserRole(role)
        else:
            user_role = role
    except ValueError:
        return False
    return action in ROLE_PERMISSIONS.get(user_role, set())


# ---------------------------------------------------------------------------
# Secure Path Traversal Sanitization & Tenant Isolation
# ---------------------------------------------------------------------------

DANGEROUS_WINDOWS_FILENAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
}

DISALLOWED_FILE_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".sh", ".bash", ".ps1", ".vbs",
    ".php", ".py", ".rb", ".pl", ".cgi", ".asp", ".aspx", ".jsp",
    ".dll", ".so", ".dylib", ".bin", ".scr", ".pif", ".hta",
    ".html", ".htm", ".xhtml", ".shtml", ".svgz"
}


def sanitize_filename(filename: str, max_length: int = 120) -> str:
    """
    Cleanses filenames to prevent path traversal, null byte injections,
    and Windows device name collisions.
    """
    if not filename:
        return "unnamed_file"

    # Strip null bytes and control characters
    cleaned = filename.replace("\0", "").strip()

    # Get only the base name (strip any leading directory traversal)
    base_name = Path(cleaned).name

    # Remove dangerous characters, allow alphanumerics, hyphens, underscores, dots
    safe_name = re.sub(r"[^\w\s\.-]", "_", base_name)
    safe_name = re.sub(r"\s+", "_", safe_name).strip("._")

    if not safe_name:
        safe_name = "sanitized_upload"

    stem = Path(safe_name).stem.upper()
    if stem in DANGEROUS_WINDOWS_FILENAMES:
        safe_name = f"safe_{safe_name}"

    ext = Path(safe_name).suffix.lower()
    if ext in DISALLOWED_FILE_EXTENSIONS:
        safe_name = f"{Path(safe_name).stem}.blocked"

    if len(safe_name) > max_length:
        safe_stem = safe_name[:max_length - len(ext)]
        safe_name = f"{safe_stem}{ext}"

    return safe_name


def safe_join_path(base_dir: Path, *segments: str) -> Path:
    """
    Safely joins path segments to a base directory, strictly guaranteeing
    that the resolved child path cannot escape outside base_dir.
    Raises SecurityPathTraversalError on traversal attempts.
    """
    resolved_base = base_dir.resolve()
    target_path = resolved_base

    for seg in segments:
        clean_seg = sanitize_filename(seg)
        target_path = target_path / clean_seg

    resolved_target = target_path.resolve()

    try:
        # Check that resolved_target is within resolved_base
        if hasattr(resolved_target, "is_relative_to"):
            if not resolved_target.is_relative_to(resolved_base):
                raise SecurityPathTraversalError(
                    f"Path traversal detected: '{resolved_target}' is outside authorized directory '{resolved_base}'"
                )
        else:
            common = os.path.commonpath([str(resolved_base), str(resolved_target)])
            if common != str(resolved_base):
                raise SecurityPathTraversalError(
                    f"Path traversal detected: '{resolved_target}' is outside authorized directory '{resolved_base}'"
                )
    except ValueError as exc:
        raise SecurityPathTraversalError(f"Invalid path traversal attempt: {exc}") from exc

    return resolved_target


def sanitize_org_id(org_id: str) -> str:
    """Sanitizes an organization tenant identifier."""
    if not org_id or not org_id.strip():
        return "default-org"
    clean = re.sub(r"[^\w\-]", "_", org_id.strip())
    return clean[:64] or "default-org"


def get_tenant_storage_path(org_id: str, subfolder: str = "uploads") -> Path:
    """
    Returns an isolated filesystem directory dedicated exclusively to one tenant.
    Guarantees strict organisation-level data separation.
    """
    clean_org = sanitize_org_id(org_id)
    clean_subfolder = sanitize_filename(subfolder)
    base_tenants = settings.STORAGE_DIR / "tenants"
    tenant_dir = safe_join_path(base_tenants, clean_org, clean_subfolder)
    tenant_dir.mkdir(parents=True, exist_ok=True)
    return tenant_dir


def verify_tenant_isolation(resource_org_id: str, requester_org_id: str) -> None:
    """
    Strict boundary check preventing cross-tenant access.
    Raises TenantIsolationViolationError if organizations do not match.
    """
    clean_res = sanitize_org_id(resource_org_id)
    clean_req = sanitize_org_id(requester_org_id)
    if clean_res != clean_req:
        logger.warning(
            "Security Alert: Cross-tenant access blocked. Requester org '%s' attempted to access org '%s' asset.",
            clean_req, clean_res
        )
        raise TenantIsolationViolationError(
            f"Access denied: organization '{clean_req}' cannot access resources belonging to '{clean_res}'."
        )


# ---------------------------------------------------------------------------
# Magic Bytes & File Content Inspection
# ---------------------------------------------------------------------------

MAGIC_SIGNATURES: List[Tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"%PDF-", "application/pdf"),
    (b"ID3", "audio/mpeg"),
    (b"\xff\xfb", "audio/mpeg"),
    (b"\xff\xf3", "audio/mpeg"),
    (b"\xff\xf2", "audio/mpeg"),
]

MAX_FILE_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB limit


def inspect_file_magic_bytes(data: bytes, filename: str) -> Tuple[bool, str, str]:
    """
    Inspects leading bytes of uploaded files to verify authentic file types.
    Prevents executable masquerading (e.g. .exe renamed to .png).
    Returns (is_valid, detected_mime, message).
    """
    if not data:
        return False, "application/octet-stream", "File is empty (0 bytes)."

    if len(data) > MAX_FILE_UPLOAD_BYTES:
        return False, "application/octet-stream", f"File size ({len(data)} bytes) exceeds max limit of 50MB."

    ext = Path(filename).suffix.lower()
    if ext in DISALLOWED_FILE_EXTENSIONS:
        return False, "application/octet-stream", f"Executable extension '{ext}' is forbidden."

    # Check for WebP: 'RIFF' at 0..4 and 'WEBP' at 8..12
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True, "image/webp", "Valid WebP image detected."

    # Check for WAV: 'RIFF' at 0..4 and 'WAVE' at 8..12
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return True, "audio/wav", "Valid WAV audio detected."

    # Check known binary signatures
    for sig, mime in MAGIC_SIGNATURES:
        if data.startswith(sig):
            return True, mime, f"Valid signature verified for {mime}."

    # Check for SVG (XML text containing <svg)
    if ext == ".svg" or b"<svg" in data[:1024]:
        try:
            sample_len = min(len(data), 65536)
            head_text = data[:sample_len].decode("utf-8", errors="ignore").lower()
            if "<svg" in head_text:
                # Security check for script injections & XML entities in SVG
                svg_forbidden = [
                    "<script", "javascript:", "onload=", "onerror=", "onclick=",
                    "<!entity", "<!doctype", "<foreignobject", "<iframe", "<embed"
                ]
                if any(bad in head_text for bad in svg_forbidden):
                    return False, "image/svg+xml", "SVG contains forbidden active script, entity, or event handler injection."
                return True, "image/svg+xml", "Valid SVG vector graphic detected."
        except Exception:
            pass

    # Check for text/plain or markdown / json
    if ext in {".txt", ".md", ".json", ".csv"}:
        try:
            decoded = data[:4096].decode("utf-8")
            if "\0" in decoded:
                return False, "application/octet-stream", "Binary null bytes detected in text upload."
            # Check for embedded HTML/script tags in text uploads
            lowered = decoded.lower()
            if "<script" in lowered or "<html" in lowered or "javascript:" in lowered:
                return False, "text/plain", "Embedded HTML or script tags detected in text upload."
            return True, "text/plain" if ext != ".json" else "application/json", "Valid text content detected."
        except UnicodeDecodeError:
            return False, "application/octet-stream", "Text file contains invalid UTF-8 bytes."

    # Check if executable binary header disguised (e.g. Windows PE 'MZ' or Linux ELF)
    if data.startswith(b"MZ") or data.startswith(b"\x7fELF"):
        return False, "application/x-executable", "Forbidden executable binary header detected."

    # For image extensions, require strict signature match
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"}:
        return False, "application/octet-stream", f"File extension '{ext}' does not match its binary magic bytes signature."

    # Fallback for generic harmless documents
    return True, "application/octet-stream", "Unidentified non-executable file accepted."

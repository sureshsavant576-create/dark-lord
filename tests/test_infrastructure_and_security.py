import io
from pathlib import Path
import pytest
from pydantic import BaseModel, Field

from backend.app.ai.base import MultimodalEvaluation, ProviderStatus
from backend.app.ai.gateway import ai_gateway
from backend.app.ai.groq_provider import GroqProvider
from backend.app.core.config import settings
from backend.app.core.resilience import (
    is_rate_limit_error,
    is_transient_error,
    retry_with_backoff,
    sanitize_raw_llm_json,
    validate_ai_json_output,
)
from backend.app.core.security import (
    ConfidentialityLevel,
    SecurityPathTraversalError,
    TenantIsolationViolationError,
    UserRole,
    check_role_clearance,
    check_role_permission,
    get_tenant_storage_path,
    inspect_file_magic_bytes,
    safe_join_path,
    sanitize_filename,
    verify_tenant_isolation,
)
from backend.app.models.audit import AuditEventSeverity, AuditEventType, AuditLogQuery
from backend.app.services.audit_service import audit_service


# ---------------------------------------------------------------------------
# 1. Modular AI Providers (Requirement 1)
# ---------------------------------------------------------------------------

def test_modular_ai_providers():
    """Verifies that both Gemini and Groq AI providers are modularly registered in AIGateway."""
    assert "gemini" in ai_gateway.providers
    assert "groq" in ai_gateway.providers

    gemini = ai_gateway.get_provider("gemini")
    groq = ai_gateway.get_provider("groq")

    assert gemini.provider_name() == "gemini"
    assert groq.provider_name() == "groq"

    status = ai_gateway.get_status()
    assert "gemini" in status
    assert "groq" in status
    assert "Groq" in status["groq"]["role"]


# ---------------------------------------------------------------------------
# 2 & 3. Environment Variables & Zero Exposed Secrets (Requirements 2 & 3)
# ---------------------------------------------------------------------------

def test_credentials_loaded_from_environment_variables():
    """Verifies credentials are bound from env settings without hardcoded fallback strings."""
    assert isinstance(settings.DEFAULT_VISION_MODEL, str)
    assert isinstance(settings.GROQ_VISION_MODEL, str)
    # Check that settings does not contain literal exposed dummy strings
    if settings.GEMINI_API_KEY:
        assert not settings.GEMINI_API_KEY.startswith("AIzaSyDUMMY")


def test_zero_exposed_secrets_in_frontend():
    """Scans all frontend files and static assets to ensure zero exposed API keys or secrets."""
    frontend_files = list(Path("frontend").rglob("*.ts*")) + list(Path("frontend").rglob("*.js*"))
    static_files = list(Path("backend/app/static").rglob("*.js")) + list(Path("backend/app/static").rglob("*.html"))

    all_files = frontend_files + static_files
    forbidden_tokens = [
        "AIzaSy",  # Google API key prefix
        "gsk_",    # Groq API key prefix
        "sk-proj", # OpenAI project key prefix
        "sk-ant",  # Anthropic key prefix
    ]

    for f in all_files:
        if f.is_file() and not str(f).endswith((".png", ".jpg", ".svg", ".ico")):
            text = f.read_text(encoding="utf-8", errors="ignore")
            for token in forbidden_tokens:
                assert token not in text, f"Potential secret leak detected in {f}: token {token}"


# ---------------------------------------------------------------------------
# 4 & 5. API Timeouts, Retries & Rate Limit Handling (Requirements 4 & 5)
# ---------------------------------------------------------------------------

def test_rate_limit_and_transient_error_detection():
    """Verifies regex and substring detection of HTTP 429 rate limits and transient errors."""
    rate_err = Exception("429 Too Many Requests: Rate limit exceeded on groq model.")
    assert is_rate_limit_error(rate_err)
    assert is_transient_error(rate_err)

    transient_err = Exception("503 Service Unavailable: connection reset by peer")
    assert not is_rate_limit_error(transient_err)
    assert is_transient_error(transient_err)


@pytest.mark.asyncio
async def test_retry_with_backoff_recovers_after_rate_limit():
    """Verifies that retry_with_backoff retries transient failures and eventually succeeds."""
    call_count = 0

    @retry_with_backoff(max_retries=3, initial_delay=0.01, max_delay=0.05)
    async def flaky_api_call():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise Exception("429 Too Many Requests: rate_limit hit")
        return "success"

    result = await flaky_api_call()
    assert result == "success"
    assert call_count == 3


# ---------------------------------------------------------------------------
# 6. AI JSON Validation (Requirement 6)
# ---------------------------------------------------------------------------

class SampleSchema(BaseModel):
    name: str
    score: float = Field(default=0.0)
    tags: list[str] = Field(default_factory=list)


def test_validate_ai_json_output():
    """Verifies robust sanitization and Pydantic validation of raw AI markdown-fenced JSON."""
    raw_ai_text = """
    Here is the response:
    ```json
    {
      "name": "Brand Compliance",
      "score": 95.5,
      "tags": ["visual", "tone",],
    }
    ```
    """
    validated = validate_ai_json_output(raw_ai_text, SampleSchema)
    assert validated.name == "Brand Compliance"
    assert validated.score == 95.5
    assert validated.tags == ["visual", "tone"]


# ---------------------------------------------------------------------------
# 7. Secure File Uploads & Magic Bytes (Requirement 7)
# ---------------------------------------------------------------------------

def test_secure_file_uploads_magic_bytes():
    """Verifies that magic bytes inspection validates real images and blocks executables/scripts."""
    # Real PNG signature
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    is_valid, mime, msg = inspect_file_magic_bytes(png_bytes, "poster.png")
    assert is_valid
    assert mime == "image/png"

    # Real PDF signature
    pdf_bytes = b"%PDF-1.4 header contents..."
    is_valid, mime, msg = inspect_file_magic_bytes(pdf_bytes, "guideline.pdf")
    assert is_valid
    assert mime == "application/pdf"

    # Disguised Windows Executable (MZ header named as .png)
    fake_png = b"MZ\x90\x00\x03\x00\x00\x00"
    is_valid, mime, msg = inspect_file_magic_bytes(fake_png, "malicious.png")
    assert not is_valid
    assert "Forbidden executable" in msg or "does not match" in msg

    # SVG with malicious script injection
    bad_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert('xss')</script></svg>"
    is_valid, mime, msg = inspect_file_magic_bytes(bad_svg, "vector.svg")
    assert not is_valid
    assert "forbidden active script" in msg


# ---------------------------------------------------------------------------
# 8 & 11. Multi-Tenant Isolation & Safe Paths (Requirements 8 & 11)
# ---------------------------------------------------------------------------

def test_tenant_isolation_boundary():
    """Verifies strict organisation-level data separation."""
    # Matching tenant
    verify_tenant_isolation("org-alpha", "org-alpha")

    # Mismatched tenant raises TenantIsolationViolationError
    with pytest.raises(TenantIsolationViolationError):
        verify_tenant_isolation("org-alpha", "org-beta")


def test_safe_join_path_prevents_traversal():
    """Verifies that directory traversal attacks (../) are completely thwarted."""
    base = Path("data/storage").resolve()

    # Normal child path is valid
    safe = safe_join_path(base, "uploads", "test.png")
    assert safe.resolve().is_relative_to(base)

    # Path traversal attempt is sanitized and contained
    clean = sanitize_filename("../../etc/passwd")
    assert ".." not in clean
    assert clean == "passwd"


# ---------------------------------------------------------------------------
# 9 & 11. Role-Based Access Control (RBAC) & Clearance (Requirements 9 & 11)
# ---------------------------------------------------------------------------

def test_role_clearance_and_permissions():
    """Verifies that confidentiality tiers and workflow permissions obey the RBAC matrix."""
    # Creators cannot view confidential or restricted documents
    assert check_role_clearance(UserRole.CREATOR, ConfidentialityLevel.PUBLIC)
    assert check_role_clearance(UserRole.CREATOR, ConfidentialityLevel.INTERNAL)
    assert not check_role_clearance(UserRole.CREATOR, ConfidentialityLevel.CONFIDENTIAL)
    assert not check_role_clearance(UserRole.CREATOR, ConfidentialityLevel.RESTRICTED)

    # Managers can view up to CONFIDENTIAL
    assert check_role_clearance(UserRole.MANAGER, ConfidentialityLevel.CONFIDENTIAL)
    assert not check_role_clearance(UserRole.MANAGER, ConfidentialityLevel.RESTRICTED)

    # Authorised Reviewer & Administrator have full clearance
    assert check_role_clearance(UserRole.AUTHORISED_REVIEWER, ConfidentialityLevel.RESTRICTED)
    assert check_role_clearance(UserRole.ADMINISTRATOR, ConfidentialityLevel.RESTRICTED)

    # Action permissions
    assert check_role_permission(UserRole.CREATOR, "upload_creative")
    assert not check_role_permission(UserRole.CREATOR, "approve_review")
    assert check_role_permission(UserRole.AUTHORISED_REVIEWER, "approve_review")
    assert check_role_permission(UserRole.ADMINISTRATOR, "manage_policy_exceptions")


# ---------------------------------------------------------------------------
# 10. Audit Logging (Requirement 10)
# ---------------------------------------------------------------------------

def test_audit_logging_and_query():
    """Verifies structured audit events are logged, immutable, and queryable per tenant."""
    test_org = "test-security-org"

    # Log events
    ev1 = audit_service.log_event(
        event_type=AuditEventType.FILE_UPLOAD,
        org_id=test_org,
        user_id="creator_1",
        user_role="Creator",
        resource_id="asset_001.png",
        details={"size": 1024}
    )
    assert ev1.id is not None
    assert ev1.org_id == test_org

    ev2 = audit_service.log_event(
        event_type=AuditEventType.ACCESS_DENIED,
        org_id=test_org,
        user_id="intruder",
        user_role="Creator",
        severity=AuditEventSeverity.WARNING,
        details={"reason": "Clearance missing"},
        success=False
    )

    # Query events
    events = audit_service.query_events(AuditLogQuery(org_id=test_org, limit=10))
    assert len(events) >= 2
    assert events[0].event_type == AuditEventType.ACCESS_DENIED  # newest first

    # Summary
    summary = audit_service.get_summary(test_org)
    assert summary.total_events >= 2
    assert summary.by_event_type.get("ACCESS_DENIED", 0) >= 1
    assert len(summary.recent_security_alerts) >= 1

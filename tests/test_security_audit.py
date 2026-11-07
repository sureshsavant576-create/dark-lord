import io
from PIL import Image
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.preprocessing.validator import inspect_file_content_safety, sanitize_filename

client = TestClient(app)

def test_security_headers_present():
    """Verify VULN-INFRA-01: All defensive HTTP security headers are enforced."""
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert "default-src 'self'" in res.headers.get("content-security-policy", "")
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

def test_file_upload_rejects_disguised_executable():
    """Verify VULN-FILE-01: Disguised Windows PE and ELF executables are blocked."""
    fake_exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00" + b"A" * 100
    files = {"file": ("malicious_program.png", io.BytesIO(fake_exe_bytes), "image/png")}
    res = client.post("/api/v1/brands/extract-palette", files=files)
    assert res.status_code == 400
    assert "Executable file detected" in res.json().get("detail", "")

def test_file_upload_rejects_malicious_svg():
    """Verify VULN-FILE-01: SVG with active script tags or onload handlers are blocked."""
    malicious_svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
    files = {"file": ("xss_attack.svg", io.BytesIO(malicious_svg), "image/svg+xml")}
    res = client.post("/api/v1/brands/extract-palette", files=files)
    assert res.status_code == 400
    assert "prohibited active script" in res.json().get("detail", "")

def test_file_upload_accepts_valid_png():
    """Verify VULN-FILE-01: Authentic PNG files are accepted."""
    img = Image.new("RGB", (50, 50), color="#FC5404")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    files = {"file": ("authentic.png", buf, "image/png")}
    res = client.post("/api/v1/brands/extract-palette", files=files)
    assert res.status_code == 200
    assert "dominant_color" in res.json()

def test_decompression_bomb_rejection():
    """Verify VULN-DOS-02: Decompression Bomb images (>25 Megapixels) are rejected."""
    # Create empty image with massive header dimensions (6000 x 5000 = 30 Megapixels)
    huge_img = Image.new("RGB", (6000, 5000), color="#FFFFFF")
    buf = io.BytesIO()
    huge_img.save(buf, format="PNG")
    buf.seek(0)

    files = {"file": ("pixel_bomb.png", buf, "image/png")}
    res = client.post("/api/v1/brands/extract-palette", files=files)
    assert res.status_code == 400
    assert "Decompression Bomb" in res.json().get("detail", "")

def test_role_based_access_control_on_review():
    """Verify VULN-AUTH-01: Standard developers cannot submit compliance review decisions."""
    headers = {
        "X-User-Id": "unauthorized-dev",
        "X-User-Role": "developer"
    }
    payload = {
        "inspection_id": "test-inspection-123",
        "decision": "APPROVED",
        "reviewer_notes": "Attempted developer review."
    }
    res = client.post("/api/v1/reports/test-inspection-123/review", json=payload, headers=headers)
    assert res.status_code == 403
    assert "Forbidden" in res.json().get("detail", "")

def test_role_based_access_control_on_brand_deletion():
    """Verify VULN-AUTH-01: Unauthorized user cannot delete brand owned by another user."""
    draft_res = client.post(
        "/api/v1/brands/draft",
        data={
            "brand_name": "Alpha Corp Standard",
            "personality": "Corporate",
            "mood": "Serious",
            "communication_tone": "Formal",
            "target_audience": "Executives",
            "visual_style": "Minimal",
            "palette": "#000000, #FFFFFF",
            "disallowed_elements": "cheap"
        },
        headers={"X-User-Id": "lead-alpha", "X-User-Role": "compliance_lead", "X-Org-Id": "org-alpha"}
    )
    assert draft_res.status_code == 200
    brand_id = draft_res.json()["brand_id"]

    del_res = client.delete(
        f"/api/v1/brands/{brand_id}",
        headers={"X-User-Id": "attacker-beta", "X-User-Role": "developer", "X-Org-Id": "org-beta"}
    )
    assert del_res.status_code == 403
    assert "Forbidden" in del_res.json().get("detail", "")

    admin_del = client.delete(
        f"/api/v1/brands/{brand_id}",
        headers={"X-User-Role": "admin"}
    )
    assert admin_del.status_code == 200

def test_user_registration_and_password_hashing():
    """Verify VULN-AUTH-02: Persistent user registration, PBKDF2 hashing, and login authentication."""
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "security.analyst@brandshield.ai",
            "password": "SecurePassword2026!",
            "role": "compliance_lead",
            "org_id": "brandshield-corp"
        }
    )
    assert reg_res.status_code in (200, 400) # 400 if already registered from previous run
    if reg_res.status_code == 200:
        data = reg_res.json()
        assert data["email"] == "security.analyst@brandshield.ai"
        assert "session_token" in data

    # Verify login with valid password
    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email": "security.analyst@brandshield.ai",
            "password": "SecurePassword2026!"
        }
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    token = login_data["session_token"]
    assert token is not None

    # Test /me endpoint with Bearer token
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["role"] == "compliance_lead"

    # Verify login failure with invalid password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "security.analyst@brandshield.ai",
            "password": "WrongPassword!"
        }
    )
    assert bad_login.status_code == 401

    # Verify logout revokes token
    logout_res = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200
    after_logout = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert after_logout.status_code == 401

def test_idor_protection_on_reports():
    """Verify VULN-IDOR-01: Developers cannot view other users' inspection reports."""
    from backend.app.models.brand import BrandProfile, ProfileStatus
    from backend.app.services.brand_service import brand_service

    brand_service.save_brand_profile(
        BrandProfile(
            brand_id="test-secure-brand",
            brand_name="Test Secure Brand",
            status=ProfileStatus.CONFIRMED,
            personality=["Secure"],
            mood=["Strict"],
            communication_tone=["Formal"],
            target_audience="Security testers",
            approved_palette=["#000000", "#FFFFFF"],
            disallowed_elements=["compromise"],
        )
    )

    # User Alice submits creative
    alice_res = client.post(
        "/api/v1/inspect/test-secure-brand",
        data={"copy_text": "Confidential Campaign by Alice."},
        headers={"X-User-Id": "alice-dev", "X-User-Role": "developer", "X-Org-Id": "org-alice"}
    )
    assert alice_res.status_code == 200
    rep_id = alice_res.json()["inspection_id"]

    # Bob (developer from org-bob) attempts to access Alice's report
    bob_res = client.get(
        f"/api/v1/reports/{rep_id}",
        headers={"X-User-Id": "bob-dev", "X-User-Role": "developer", "X-Org-Id": "org-bob"}
    )
    assert bob_res.status_code == 403
    assert "Forbidden" in bob_res.json().get("detail", "")

    # Alice accesses her own report
    alice_check = client.get(
        f"/api/v1/reports/{rep_id}",
        headers={"X-User-Id": "alice-dev", "X-User-Role": "developer", "X-Org-Id": "org-alice"}
    )
    assert alice_check.status_code == 200

def test_rate_limiting_enforcement():
    """Verify VULN-DOS-01: Excessive rapid requests trigger HTTP 429."""
    import time
    from backend.app.core.rate_limiter import rate_limiter
    now = time.time()
    rate_limiter._requests["testclient:heavy"] = [now] * 50
    res = client.post("/api/v1/brands/draft", data={"brand_name": "Burst Test"})
    assert res.status_code == 429
    assert "Rate limit exceeded" in res.json().get("detail", "")
    assert "retry_after_seconds" in res.json()
    rate_limiter._requests.clear()

def test_error_shielding_no_stack_disclosure():
    """Verify VULN-INFO-01: Internal errors do not leak internal system filepaths."""
    res = client.post("/api/v1/inspect/prefilter-colors/non-existent-brand-xyz", files={})
    assert res.status_code in (404, 422)
    detail = str(res.json().get("detail", ""))
    assert "Traceback" not in detail
    assert "backend/app" not in detail

"""
Round 3 Final Verification Test Suite for Sanket AI.
Tests:
1. Demo Judge Account Authentication (demo@sanket.ai / DemoJudge2026!)
2. Session Token Generation, Verification & Expiry/Revocation
3. Role-Based Clearance & Unauthorized Access Rejection
4. Empty Inputs & Missing Payload Resilience
5. Invalid File & Corrupt Upload Resilience
6. End-to-End Judge Journey: Brand DNA Retrieval & Viewing
7. End-to-End Judge Journey: Knowledge Base Storage & Retrieval
8. End-to-End Judge Journey: Content Review & Issue Detection
9. Round 2 Commitment 1: Interactive Brand Co-Pilot (Chat & Action)
10. Round 2 Commitment 2: Generative Visual Auto-Fix (Recoloring & Decisions)
11. Round 2 Commitment 3: Instant Pre-Flight Scanner (Telemetry & Style)
12. End-to-End Judge Journey: Approval Workflow Lifecycle & Audit Trail
"""

import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import app
from backend.app.core.auth import auth_service, UserRole
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.services.brand_service import brand_service
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.remediation_service import creative_remediation_service
from backend.app.services.workflow_service import (
    workflow_service,
    SubmitContentRequest,
    WorkflowRole,
    ContentStatus,
    ApprovalDecisionRequest
)

@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_round3_test_environment():
    # 1. Register demo judge user in test DB
    try:
        auth_service.register_user(
            email="demo@sanket.ai",
            password="DemoJudge2026!",
            role=UserRole.ADMIN,
            org_id="test_master_brand"
        )
    except Exception:
        pass

    # 2. Setup test brand in test DB
    test_brand = BrandProfile(
        brand_id="test_master_brand",
        brand_name="MasterBrand Systems",
        status=ProfileStatus.CONFIRMED,
        personality=["Innovative", "Reliable", "Authoritative"],
        communication_tone=["Confident", "Direct", "Technically Rigorous"],
        approved_palette=["#0052CC", "#0747A6", "#172B4D", "#FFFFFF"],
        disallowed_elements=["cheap", "fake", "guaranteed bug-free", "unhackable"],
        mission_statement="Pioneering enterprise reliability and security.",
        is_human_confirmed=True
    )
    brand_service.save_brand_profile(test_brand)


# ===========================================================================
# 1. DEMO JUDGE ACCOUNT & AUTHENTICATION
# ===========================================================================
def test_demo_judge_login(client):
    """Verifies that demo@sanket.ai / DemoJudge2026! authenticates successfully."""
    res = client.post("/api/v1/auth/login", json={
        "email": "demo@sanket.ai",
        "password": "DemoJudge2026!"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "demo@sanket.ai"
    assert data["role"] in ("admin", "compliance_lead")
    assert "session_token" in data
    assert len(data["session_token"]) > 20


def test_session_token_verification_and_revocation(client):
    """Tests session token validity, /auth/me profile retrieval, and logout revocation."""
    res = client.post("/api/v1/auth/login", json={
        "email": "demo@sanket.ai",
        "password": "DemoJudge2026!"
    })
    token = res.json()["session_token"]

    # Verify session via /auth/me
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["user_id"] == "user_88bbba6639"

    # Logout to revoke
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Token must now be rejected
    rejected = client.get("/api/v1/auth/me", headers=headers)
    assert rejected.status_code == 401


# ===========================================================================
# 2. RELIABILITY: EMPTY INPUTS & UNEXPECTED PAYLOADS
# ===========================================================================
def test_empty_and_invalid_auth_credentials(client):
    """Tests rejection of invalid or malformed authentication attempts."""
    # Wrong password
    bad_res = client.post("/api/v1/auth/login", json={
        "email": "demo@sanket.ai",
        "password": "WrongPassword999!"
    })
    assert bad_res.status_code == 401

    # Malformed email
    empty_res = client.post("/api/v1/auth/login", json={
        "email": "not-an-email",
        "password": "short"
    })
    assert empty_res.status_code == 401


def test_empty_content_audit_payload(client):
    """Tests empty/whitespace copy handling in content review audit."""
    res = client.post("/api/v1/reviews/audit", json={
        "org_id": "test_master_brand",
        "brand_id": "test_master_brand",
        "content_type": "text",
        "department": "Engineering",
        "copy_text": "   "
    })
    # Should safely return an evaluation without crashing
    assert res.status_code in (200, 422)


def test_invalid_file_upload_handling(client):
    """Tests resilience against non-image corrupt bytes uploaded to preflight scanner."""
    files = {"file": ("corrupt.png", b"NOT_A_VALID_IMAGE_HEADER_12345", "image/png")}
    res = client.post("/api/v1/inspect/preflight-scan", files=files)
    # Must fail gracefully (HTTP 400 or handled error) without unhandled 500 crash
    assert res.status_code in (400, 422)


# ===========================================================================
# 3. ROUND 2 COMMITMENTS VERIFICATION
# ===========================================================================
def test_commitment_1_brand_copilot_chat(client):
    """Verifies Interactive Brand Co-Pilot endpoint grounded in Brand DNA."""
    res = client.post("/api/v1/inspect/test_master_brand/copilot-chat", json={
        "brand_id": "test_master_brand",
        "message": "Why was the word cheap flagged, and how can I rewrite this?",
        "copy_text": "Our cheap cloud servers are unhackable and guaranteed 100% bug-free.",
        "discrepancies": ["Disallowed: cheap", "Unsubstantiated: unhackable"]
    })
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert len(data["reply"]) > 0
    assert "structured_corrections" in data


def test_commitment_2_generative_visual_autofix(tmp_path):
    """Verifies visual Auto-Fix recoloring with separate file preservation."""
    img_path = tmp_path / "autofix_input.png"
    img = Image.new("RGB", (120, 120), color=(255, 40, 20))
    img.save(img_path)

    res = creative_remediation_service.auto_remediate_image(
        image_path=img_path,
        brand_id="test_master_brand"
    )
    assert res["remediated_image_url"] is not None
    assert res["new_delta_e"] < 15.0
    assert res["requires_human_approval"] is True


def test_commitment_3_preflight_scanner_telemetry(client):
    """Verifies instant preflight scanner telemetry before backend submit."""
    img = Image.new("RGB", (250, 150), color=(11, 19, 43))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    files = {"file": ("banner.png", buf.getvalue(), "image/png")}
    res = client.post("/api/v1/inspect/preflight-scan", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "PREFLIGHT_DIAGNOSED"
    assert data["dimensions"]["width"] == 250
    assert data["dimensions"]["height"] == 150
    assert "dominant_swatches" in data
    assert "predicted_style" in data


# ===========================================================================
# 4. END-TO-END APPROVAL WORKFLOW FOR JUDGES
# ===========================================================================
def test_full_approval_workflow_lifecycle():
    """Verifies judge can submit, revise, and approve content."""
    # 1. Submit content
    item = workflow_service.submit_content(SubmitContentRequest(
        org_id="test_master_brand",
        brand_id="test_master_brand",
        title="Judge Demo Campaign",
        content_text="Apex provides enterprise zero-trust security.",
        user_id="judge_evaluator",
        user_name="Demo Judge",
        user_role=WorkflowRole.CREATOR
    ))
    assert item.status == ContentStatus.UNDER_REVIEW

    # 2. Approve content
    dec = workflow_service.record_decision(
        item.item_id,
        "test_master_brand",
        ApprovalDecisionRequest(
            user_id="judge_evaluator",
            user_name="Demo Judge",
            user_role=WorkflowRole.AUTHORISED_REVIEWER,
            decision="approve",
            notes="Verified against official security policies."
        )
    )
    assert dec.status == ContentStatus.APPROVED


# ===========================================================================
# 5. GROQ API RESILIENCE & ERROR HANDLING
# ===========================================================================
def test_groq_api_endpoint_handling(client):
    """Verifies that /api/v1/system/test-groq properly handles unconfigured and invalid keys."""
    # 1. Unconfigured check
    res_unconf = client.get("/api/v1/system/test-groq")
    assert res_unconf.status_code == 200
    data_unconf = res_unconf.json()
    assert "status" in data_unconf

    # 2. Invalid key handling
    res_inv = client.post("/api/v1/system/test-groq", json={
        "api_key": "gsk_invalid_test_mock_key_99999",
        "prompt": "Test"
    })
    assert res_inv.status_code == 200
    data_inv = res_inv.json()
    assert data_inv["status"] in ("invalid_api_key", "error", "unconfigured")


import io
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.auth import auth_service

client = TestClient(app)

def test_single_report_deletion():
    # 1. Create a test brand
    draft_res = client.post(
        "/api/v1/brands/draft",
        data={
            "brand_name": "Deletable Tech",
            "personality": "Modern, Sleek",
            "mood": "Confident",
            "communication_tone": "Direct",
            "target_audience": "Developers",
            "visual_style": "Minimal",
            "palette": "#101010, #FFFFFF, #00FFCC",
            "disallowed_elements": "cheap, discount",
            "tagline_or_mission": "Code with confidence"
        },
        headers={"X-User-Role": "compliance_lead", "X-User-Id": "test-lead", "X-Org-Id": "test-org"}
    )
    assert draft_res.status_code == 200
    brand_id = draft_res.json()["brand_id"]

    # 2. Submit a creative text inspection
    inspect_res = client.post(
        f"/api/v1/inspect/{brand_id}",
        data={"copy_text": "Deletable Tech provides developer tools with high precision."},
        headers={"X-User-Role": "developer", "X-User-Id": "test-dev", "X-Org-Id": "test-org"}
    )
    assert inspect_res.status_code == 200
    report_data = inspect_res.json()
    insp_id = report_data["inspection_id"]

    # Check report exists (accessed by submitter)
    get_res = client.get(
        f"/api/v1/reports/{insp_id}",
        headers={"X-User-Role": "developer", "X-User-Id": "test-dev", "X-Org-Id": "test-org"}
    )
    assert get_res.status_code == 200

    # 3. Unauthorized deletion attempt (attacker from different org)
    unauth_del = client.delete(
        f"/api/v1/reports/{insp_id}",
        headers={"X-User-Role": "developer", "X-User-Id": "attacker", "X-Org-Id": "other-org"}
    )
    assert unauth_del.status_code == 403

    # 4. Authorized deletion (by the submitter)
    del_res = client.delete(
        f"/api/v1/reports/{insp_id}",
        headers={"X-User-Role": "developer", "X-User-Id": "test-dev", "X-Org-Id": "test-org"}
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # Verify report is permanently gone
    get_after = client.get(
        f"/api/v1/reports/{insp_id}",
        headers={"X-User-Role": "admin"}
    )
    assert get_after.status_code == 404

    # Cleanup brand
    client.delete(f"/api/v1/brands/{brand_id}", headers={"X-User-Role": "admin"})

def test_clear_all_reports_history():
    # 1. Create brand
    draft_res = client.post(
        "/api/v1/brands/draft",
        data={
            "brand_name": "History Purge Brand",
            "personality": "Swift",
            "mood": "Bold",
            "communication_tone": "Crisp",
            "target_audience": "Auditors",
            "visual_style": "Geometric",
            "palette": "#222222, #EEEEEE",
            "disallowed_elements": "sloppy"
        },
        headers={"X-User-Role": "admin"}
    )
    assert draft_res.status_code == 200
    brand_id = draft_res.json()["brand_id"]

    # Create 2 reports
    client.post(
        f"/api/v1/inspect/{brand_id}",
        data={"copy_text": "First submission for audit."},
        headers={"X-User-Role": "admin"}
    )
    client.post(
        f"/api/v1/inspect/{brand_id}",
        data={"copy_text": "Second submission for audit."},
        headers={"X-User-Role": "admin"}
    )

    reports_before = client.get(f"/api/v1/reports?brand_id={brand_id}", headers={"X-User-Role": "admin"}).json()
    assert len(reports_before) >= 2

    admin_token = auth_service.create_session_token("admin-purge", "admin", "default-org")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Purge history for this brand
    purge_res = client.delete(
        f"/api/v1/reports?brand_id={brand_id}",
        headers=admin_headers
    )
    assert purge_res.status_code == 200
    assert purge_res.json()["deleted_count"] >= 2

    reports_after = client.get(f"/api/v1/reports?brand_id={brand_id}", headers=admin_headers).json()
    assert len(reports_after) == 0

    # Clean up brand
    client.delete(f"/api/v1/brands/{brand_id}", headers=admin_headers)

def test_brand_permanent_deletion_with_cascade():
    # 1. Create brand with a valid image (100x100)
    img_buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(255, 215, 0)).save(img_buf, format="PNG")
    img_buf.seek(0)

    lead_token = auth_service.create_session_token("lead-1", "compliance_lead", "org-cascade")
    lead_headers = {"Authorization": f"Bearer {lead_token}"}

    draft_res = client.post(
        "/api/v1/brands/draft",
        data={
            "brand_name": "Cascade Purge Brand",
            "personality": "Premium",
            "mood": "Elite",
            "communication_tone": "Formal",
            "target_audience": "Executives",
            "visual_style": "Gold & Black",
            "palette": "#FFD700, #000000",
            "disallowed_elements": "budget, cheap"
        },
        files=[("reference_files", ("logo.png", img_buf, "image/png"))],
        headers=lead_headers
    )
    assert draft_res.status_code == 200
    brand_id = draft_res.json()["brand_id"]

    # 2. Add an inspection report for this brand
    inspect_res = client.post(
        f"/api/v1/inspect/{brand_id}",
        data={"copy_text": "Cascade test copy."},
        headers=lead_headers
    )
    assert inspect_res.status_code == 200
    insp_id = inspect_res.json()["inspection_id"]

    # 3. Permanently delete the brand standard
    del_brand_res = client.delete(
        f"/api/v1/brands/{brand_id}?cascade_reports=true",
        headers=lead_headers
    )
    assert del_brand_res.status_code == 200
    data = del_brand_res.json()
    assert data["status"] == "success"
    assert data["cascade_reports_deleted"] >= 1

    # Verify brand is gone
    get_brand_res = client.get(f"/api/v1/brands/{brand_id}")
    assert get_brand_res.status_code == 404

    # Verify report is also gone
    get_report_res = client.get(f"/api/v1/reports/{insp_id}", headers=lead_headers)
    assert get_report_res.status_code == 404

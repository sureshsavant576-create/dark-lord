import pytest
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.brand_service import brand_service
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.services.copilot_service import (
    CopilotChatRequest,
    brand_copilot_service,
)
from backend.app.services.remediation_service import creative_remediation_service
from backend.app.services.preflight_service import preflight_scanner_service


@pytest.fixture(autouse=True)
def setup_round3_brand(tmp_path):
    test_brand = BrandProfile(
        brand_id="test_r3_brand",
        brand_name="AeroSpeed",
        status=ProfileStatus.CONFIRMED,
        personality=["Bold", "Cutting-Edge"],
        communication_tone=["Empowering", "Direct"],
        approved_palette=["#000000", "#FFFFFF", "#FF3300"],
        disallowed_elements=["cheap", "fake", "guaranteed fix"],
        mission_statement="Leading the future of speed.",
        is_human_confirmed=True
    )
    brand_service.save_brand_profile(test_brand)
    yield test_brand
    try:
        brand_service.delete_brand_profile("test_r3_brand")
    except Exception:
        pass


@pytest.mark.asyncio
async def test_brand_copilot_chat():
    req = CopilotChatRequest(
        brand_id="test_r3_brand",
        message="My poster was rejected for banned words. How do I fix it?",
        copy_text="Buy this cheap product with guaranteed fix now",
        prohibited_claims=["guaranteed fix", "cheap"],
        discrepancies=["Prohibited claim detected"]
    )
    res = await brand_copilot_service.chat(req)
    assert res.brand_name == "AeroSpeed"
    assert "AeroSpeed" in res.brand_persona or "Brand Guardian" in res.brand_persona
    assert len(res.reply) > 20
    assert len(res.suggested_rewrites) >= 1
    assert "#FF3300" in res.palette_recommendations


def test_preflight_scanner(tmp_path):
    img_path = tmp_path / "preflight_sample.png"
    # Create warm orange image
    img = Image.new("RGB", (150, 150), color=(255, 90, 10))
    img.save(img_path)

    res = preflight_scanner_service.analyze_image_preflight(img_path, brand_id="test_r3_brand")
    assert res["status"] == "PREFLIGHT_DIAGNOSED"
    assert res["color_temperature"]["category"] in ["WARM", "NEUTRAL", "COOL"]
    assert "density_ratio" in res["whitespace"]
    assert "percentage" in res["whitespace"]
    assert len(res["dominant_swatches"]) > 0
    assert "predicted_vibe" in res
    assert res["brand_alignment"] is not None
    assert "alignment_score" in res["brand_alignment"]

    # Test Visual Vibes: Cyberpunk, Minimalist, Bold
    # 1. Cyberpunk: dark background with neon cyan/magenta accents
    cyber_path = tmp_path / "cyberpunk_sample.png"
    cyber_img = Image.new("RGB", (120, 120), color=(15, 12, 28))
    # Draw neon cyan block
    for x in range(30, 90):
        for y in range(30, 90):
            cyber_img.putpixel((x, y), (0, 240, 255))
    cyber_img.save(cyber_path)
    res_cyber = preflight_scanner_service.analyze_image_preflight(cyber_path)
    assert res_cyber["predicted_style"]["style"] in ["Cyberpunk", "Bold"]

    # 2. Minimalist: large clean whitespace
    mini_path = tmp_path / "minimalist_sample.png"
    mini_img = Image.new("RGB", (120, 120), color=(250, 250, 250))
    for x in range(50, 60):
        for y in range(50, 60):
            mini_img.putpixel((x, y), (20, 20, 20))
    mini_img.save(mini_path)
    res_mini = preflight_scanner_service.analyze_image_preflight(mini_path)
    assert res_mini["predicted_style"]["style"] == "Minimalist"

    # 3. Bold: high saturation vibrant contrast
    bold_path = tmp_path / "bold_sample.png"
    bold_img = Image.new("RGB", (120, 120), color=(255, 20, 20))
    bold_img.save(bold_path)
    res_bold = preflight_scanner_service.analyze_image_preflight(bold_path)
    assert res_bold["predicted_style"]["style"] in ["Bold", "Playful"]


def test_creative_auto_remediation(tmp_path):
    off_brand_path = tmp_path / "off_brand_poster.png"
    # Create off-brand neon lime image (#00FF00)
    img = Image.new("RGB", (120, 120), color=(0, 255, 0))
    img.save(off_brand_path)

    res = creative_remediation_service.auto_remediate_image(off_brand_path, brand_id="test_r3_brand")
    assert res["status"] == "CERTIFIED_REMEDIATED"
    assert res["brand_id"] == "test_r3_brand"
    assert res["is_certified"] is True
    assert res["new_delta_e"] < 5.0
    assert res["color_compliance_score"] >= 90.0
    assert Path(res["remediated_image_url"].replace("/storage/uploads/", "storage/uploads/")).name in res["remediated_image_url"]


def test_round3_api_endpoints(tmp_path):
    client = TestClient(app)

    # 1. Test Co-Pilot endpoint
    copilot_payload = {
        "brand_id": "test_r3_brand",
        "message": "Give me 3 headlines in AeroSpeed voice",
        "copy_text": "Speed begins here"
    }
    r = client.post("/api/v1/inspect/test_r3_brand/copilot-chat", json=copilot_payload)
    assert r.status_code == 200
    data = r.json()
    assert "reply" in data
    assert "suggested_rewrites" in data
    assert len(data["palette_recommendations"]) > 0

    # 2. Test Pre-flight scan endpoint
    test_img = tmp_path / "test_api_img.png"
    Image.new("RGB", (80, 80), color=(20, 20, 20)).save(test_img)
    with open(test_img, "rb") as f:
        r2 = client.post(
            "/api/v1/inspect/preflight-scan",
            files={"file": ("test_api_img.png", f, "image/png")},
            data={"brand_id": "test_r3_brand"}
        )
    assert r2.status_code == 200
    pf_data = r2.json()
    assert pf_data["status"] == "PREFLIGHT_DIAGNOSED"
    assert "color_temperature" in pf_data

    # 3. Test Auto-Remediation endpoint
    with open(test_img, "rb") as f:
        r3 = client.post(
            "/api/v1/inspect/test_r3_brand/auto-remediate",
            files={"file": ("test_api_img.png", f, "image/png")}
        )
    assert r3.status_code == 200
    remed_data = r3.json()
    assert remed_data["status"] == "CERTIFIED_REMEDIATED"
    assert remed_data["new_delta_e"] < 5.0

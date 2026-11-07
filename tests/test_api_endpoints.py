"""Integration Tests for BrandShield AI FastAPI Endpoints (Phase 7)."""
import io
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify system health check endpoint."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app_name"] == "BrandShield AI"


def test_providers_diagnostic_endpoint():
    """Verify provider diagnostics return safe operational data without exposing secrets."""
    response = client.get("/api/v1/providers")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    assert "gemini" in data["providers"]
    assert "openai" in data["providers"]
    assert "huggingface" in data["providers"]
    assert "deterministic_local" in data["providers"]


def test_end_to_end_onboarding_and_inspection_flow():
    """Verify complete lifecycle: Onboarding Draft -> Confirmation -> Submission Inspection -> Human Sign-off."""
    # 1. Onboarding Draft Creation
    draft_payload = {
        "brand_name": "Aura Cosmetics",
        "personality": "Elegant, Clean",
        "mood": "Calm, Luxurious",
        "communication_tone": "Warm, Sophisticated",
        "target_audience": "Beauty enthusiasts",
        "visual_style": "Minimalist, Pastel",
        "palette": "#FFB6C1, #FFFFFF, #D8BFD8",
        "disallowed_elements": "cheap, synthetic, instant guarantee",
        "tagline_or_mission": "Clean beauty for modern skin"
    }

    res_draft = client.post("/api/v1/brands/draft", data=draft_payload)
    assert res_draft.status_code == 200
    draft_data = res_draft.json()
    brand_id = draft_data["brand_id"]
    assert draft_data["status"] == "DRAFT_PENDING_CONFIRMATION"

    # 2. Company Brand Profile Confirmation
    confirm_payload = {
        "brand_id": brand_id,
        "personality": ["Elegant", "Clean", "Mindful"],
        "mood": ["Calm", "Luxurious"],
        "communication_tone": ["Warm", "Sophisticated"],
        "visual_style": ["Minimalist", "Pastel"],
        "target_audience": "Beauty enthusiasts and mindful consumers",
        "approved_palette": ["#FFB6C1", "#FFFFFF", "#D8BFD8"],
        "disallowed_elements": ["cheap", "synthetic", "instant guarantee"],
        "confirmed_by": "Brand Lead"
    }

    res_confirm = client.post("/api/v1/brands/confirm", json=confirm_payload)
    assert res_confirm.status_code == 200
    confirmed_data = res_confirm.json()
    assert confirmed_data["status"] == "CONFIRMED"
    assert confirmed_data["is_human_confirmed"] is True

    # 3. Developer Submission Inspection: Off-brand Copy with Disallowed Word
    copy_content = b"Aura Cosmetics offers an instant guarantee on our newest moisturizing serum."
    files = {
        "file": ("ad_copy.txt", io.BytesIO(copy_content), "text/plain")
    }

    res_inspect = client.post(f"/api/v1/inspect/{brand_id}", files=files)
    assert res_inspect.status_code == 200
    report = res_inspect.json()
    assert report["brand_id"] == brand_id
    assert report["verdict"] in ["CHANGES_REQUESTED", "REJECTED"]
    assert any("instant guarantee" in v for v in report["guideline_violations"])

    # 4. Human Review Governance Sign-off
    inspection_id = report["inspection_id"]
    review_payload = {
        "inspection_id": inspection_id,
        "decision": "CHANGES_REQUESTED",
        "reviewer_name": "Compliance Officer",
        "reviewer_notes": "Please remove 'instant guarantee' to comply with brand standards."
    }

    res_review = client.post(f"/api/v1/reports/{inspection_id}/review", json=review_payload)
    assert res_review.status_code == 200
    updated_report = res_review.json()
    assert updated_report["human_decision"] == "CHANGES_REQUESTED"
    assert updated_report["reviewed_by"] == "Compliance Officer"

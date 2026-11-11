import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from backend.app.main import app
from backend.app.models.brand_dna import (
    BrandDNAInput,
    BrandDNAProfile,
    BrandDNAStatus,
    BrandDNASynthesis,
    BrandDNAApprovalRequest,
)
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.supabase_service import supabase_service

client = TestClient(app)

SAMPLE_INPUT = {
    "company_name": "Apex Cloud Systems",
    "industry": "Enterprise Cloud Infrastructure & Cybersecurity",
    "business_description": "We build high-availability zero-trust cloud data pipelines and automated container security.",
    "products_and_services": "Apex Shield Kubernetes Mesh, Apex Pipeline Engine, Real-time Threat Audit",
    "target_audience": "DevOps Leads, Cloud Architects, and Enterprise CISOs",
    "company_values": "Deterministic security, Zero downtime, Radical transparency",
    "brand_positioning": "The zero-trust infrastructure engine for mission-critical enterprise workloads.",
    "desired_customer_perception": "Rock-solid, uncompromising, highly technical, reliable",
    "communication_personality": "Authoritative, crisp, empowering, direct",
    "reference_brands": "Stripe, Cloudflare, HashiCorp"
}


def test_brand_dna_input_model_validation():
    inp = BrandDNAInput(**SAMPLE_INPUT)
    assert inp.company_name == "Apex Cloud Systems"
    assert inp.industry == "Enterprise Cloud Infrastructure & Cybersecurity"
    assert "Zero downtime" in inp.company_values


@pytest.mark.asyncio
async def test_brand_dna_generation_lifecycle():
    inp = BrandDNAInput(**SAMPLE_INPUT)
    profile = await brand_dna_service.generate_brand_dna(inp)

    # 1. State machine validation: Must be DRAFT pending approval
    assert profile.status == BrandDNAStatus.DRAFT_PENDING_APPROVAL
    assert profile.is_approved is False
    assert profile.approved_at is None
    assert profile.company_name == "Apex Cloud Systems"

    # 2. Strict separation of Facts vs AI Recommendations
    assert profile.company_facts.source == "company_provided"
    assert profile.company_facts.company_name == "Apex Cloud Systems"
    assert profile.company_facts.industry == "Enterprise Cloud Infrastructure & Cybersecurity"

    # 3. All 13 AI recommendations must be present and validated
    rec = profile.ai_recommendations
    assert rec.source == "ai_synthesized"
    assert len(rec.brand_personality) > 0
    assert len(rec.brand_positioning) > 0
    assert "primary_voice" in rec.brand_voice_and_tone
    assert "primary" in rec.primary_and_secondary_colours
    assert len(rec.colour_hex_codes) >= 3
    # Check valid HEX codes
    for hex_code in rec.colour_hex_codes:
        assert hex_code.startswith("#")
        assert len(hex_code) == 7

    assert "headline_font" in rec.typography_recommendations
    assert "style_ethos" in rec.visual_identity
    assert len(rec.photography_preferences) > 0
    assert "corner_radius" in rec.design_language
    assert len(rec.messaging_guidelines) > 0
    assert len(rec.preferred_terminology) > 0
    assert len(rec.words_to_avoid) > 0
    assert "dos" in rec.visual_dos_and_donts
    assert "donts" in rec.visual_dos_and_donts
    assert len(rec.visual_dos_and_donts["dos"]) > 0
    assert len(rec.visual_dos_and_donts["donts"]) > 0

    # 4. User editability: Modify draft Brand DNA
    rec.words_to_avoid.append("Hyper-growth gimmick")
    rec.colour_hex_codes[0] = "#4F46E5"
    updated_profile = brand_dna_service.update_draft_dna(profile.dna_id, rec)
    assert "Hyper-growth gimmick" in updated_profile.ai_recommendations.words_to_avoid
    assert updated_profile.ai_recommendations.colour_hex_codes[0] == "#4F46E5"
    assert updated_profile.status == BrandDNAStatus.DRAFT_PENDING_APPROVAL

    # 5. User approval and activation
    approval_payload = BrandDNAApprovalRequest(
        approved_by="Elena Rostova (Chief Brand Officer)",
        approval_notes="Approved for global Q4 creative compliance.",
        sync_to_platform_brand=True
    )
    activated = await brand_dna_service.approve_and_activate_brand_dna(profile.dna_id, approval_payload)
    assert activated.status == BrandDNAStatus.ACTIVE
    assert activated.is_approved is True
    assert activated.approved_by == "Elena Rostova (Chief Brand Officer)"
    assert activated.approved_at is not None

    # Clean up
    brand_dna_service.delete_dna_profile(profile.dna_id)


def test_supabase_service_fallback_and_status():
    status = supabase_service.get_status()
    assert "configured" in status
    assert "target_table" in status
    assert "CREATE TABLE" in status["recommended_sql_schema"]


def test_brand_dna_api_endpoints():
    # 1. Supabase status endpoint
    res_status = client.get("/api/v1/brands/dna/supabase/status")
    assert res_status.status_code == 200
    assert "target_table" in res_status.json()

    # 2. Generate Brand DNA draft via POST
    res_gen = client.post("/api/v1/brands/dna/generate", json=SAMPLE_INPUT)
    assert res_gen.status_code == 200
    data = res_gen.json()
    dna_id = data["dna_id"]
    assert data["company_name"] == "Apex Cloud Systems"
    assert data["status"] == "DRAFT_PENDING_APPROVAL"
    assert data["is_approved"] is False
    assert "company_facts" in data
    assert "ai_recommendations" in data

    # 3. Retrieve Brand DNA by ID
    res_get = client.get(f"/api/v1/brands/dna/{dna_id}")
    assert res_get.status_code == 200
    assert res_get.json()["dna_id"] == dna_id

    # 4. User edits draft Brand DNA via PUT
    edits = data["ai_recommendations"]
    edits["brand_personality"].append("Hyper-Precise")
    res_put = client.put(f"/api/v1/brands/dna/{dna_id}", json=edits)
    assert res_put.status_code == 200
    assert "Hyper-Precise" in res_put.json()["ai_recommendations"]["brand_personality"]

    # 5. Approve and Activate Brand DNA via POST
    res_app = client.post(
        f"/api/v1/brands/dna/{dna_id}/approve",
        json={
            "approved_by": "Compliance Lead",
            "approval_notes": "All 13 standards certified",
            "sync_to_platform_brand": True
        }
    )
    assert res_app.status_code == 200
    approved_data = res_app.json()
    assert approved_data["status"] == "ACTIVE"
    assert approved_data["is_approved"] is True
    assert approved_data["approved_by"] == "Compliance Lead"

    # Clean up test artifact
    brand_dna_service.delete_dna_profile(dna_id)

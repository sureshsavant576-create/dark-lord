import pytest
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.models.copilot import (
    CopilotActionRequest,
    CopilotChatRequest,
    RemediationSuggestion,
    SuggestionStatus,
    SuggestionType,
)
from backend.app.models.remediation import RemediationDecisionRequest
from backend.app.services.brand_service import brand_service
from backend.app.services.copilot_service import brand_copilot_service
from backend.app.services.remediation_service import creative_remediation_service
from backend.app.services.knowledge_service import knowledge_service


@pytest.fixture(autouse=True)
def setup_copilot_test_fixtures(tmp_path):
    test_brand = BrandProfile(
        brand_id="test_copilot_brand",
        brand_name="HyperCloud",
        status=ProfileStatus.CONFIRMED,
        personality=["Authoritative", "Direct", "Resilient"],
        communication_tone=["Empowering", "Direct", "Technically Rigorous"],
        approved_palette=["#0B132B", "#1C2541", "#5BC0BE", "#FFFFFF"],
        disallowed_elements=["cheap", "fake", "guaranteed breach-proof", "unhackable"],
        mission_statement="Zero-latency enterprise cloud security.",
        is_human_confirmed=True
    )
    brand_service.save_brand_profile(test_brand)
    
    # Seed knowledge items for HyperCloud
    knowledge_service.seed_enterprise_knowledge_base(
        org_id="test_copilot_brand",
        brand_id="test_copilot_brand"
    )

    yield test_brand

    try:
        brand_service.delete_brand_profile("test_copilot_brand")
    except Exception:
        pass


@pytest.mark.asyncio
async def test_copilot_capabilities_end_to_end():
    # 1. Ask questions about detected issues & understand violation
    req_explain = CopilotChatRequest(
        brand_id="test_copilot_brand",
        message="Why did my headline get flagged as a violation?",
        copy_text="HyperCloud is unhackable and guaranteed breach-proof for cheap enterprise servers",
        discrepancies=["Prohibited claim: unhackable", "Disallowed terminology: cheap", "Unsubstantiated guarantee"],
        intent="explain_issue"
    )
    res_explain = await brand_copilot_service.chat(req_explain)
    assert res_explain.brand_name == "HyperCloud"
    assert "HyperCloud" in res_explain.brand_persona
    assert len(res_explain.reply) > 30
    assert len(res_explain.context_sources_used) >= 1

    # 2. Terminology correction & clear distinction (Original, Suggested, Reason)
    term_corrections = [c for c in res_explain.structured_corrections if c.type == SuggestionType.TERMINOLOGY_CORRECTION]
    assert len(term_corrections) >= 1
    sample_term = term_corrections[0]
    assert sample_term.original_content is not None
    assert sample_term.suggested_correction is not None
    assert sample_term.reason_for_correction is not None
    assert sample_term.guideline_reference is not None
    assert sample_term.status == SuggestionStatus.PENDING

    # 3. Generate alternative headlines
    req_headlines = CopilotChatRequest(
        brand_id="test_copilot_brand",
        message="Generate 3 compliant headlines in HyperCloud tone",
        copy_text="HyperCloud is unhackable and guaranteed breach-proof for cheap enterprise servers",
        intent="headlines"
    )
    res_headlines = await brand_copilot_service.chat(req_headlines)
    headlines = [c for c in res_headlines.structured_corrections if c.type == SuggestionType.HEADLINE]
    assert len(headlines) >= 2
    for h in headlines:
        assert "HyperCloud" in h.suggested_correction or len(h.suggested_correction.split()) <= 10

    # 4. Step-by-step correction guidance
    req_steps = CopilotChatRequest(
        brand_id="test_copilot_brand",
        message="Give me step-by-step guidance to pass certification",
        copy_text="Unapproved copy text",
        discrepancies=["Color mismatch ΔE=32", "Prohibited terms", "Low contrast 2.4:1"],
        intent="step_by_step"
    )
    res_steps = await brand_copilot_service.chat(req_steps)
    assert len(res_steps.step_by_step_guidance) >= 3
    assert res_steps.step_by_step_guidance[0].step_number == 1
    assert "Sanitize" in res_steps.step_by_step_guidance[0].action_title or "Color" in res_steps.step_by_step_guidance[0].action_title


def test_copilot_action_and_staged_review():
    # 1. Test Accept Action
    accept_req = CopilotActionRequest(
        brand_id="test_copilot_brand",
        suggestion_id="term_001",
        action="accept"
    )
    accept_res = brand_copilot_service.process_action(accept_req)
    assert accept_res["status"] == "ACCEPTED"
    assert accept_res["requires_review_before_publish"] is True

    # 2. Test Reject Action
    reject_req = CopilotActionRequest(
        brand_id="test_copilot_brand",
        suggestion_id="term_002",
        action="reject"
    )
    reject_res = brand_copilot_service.process_action(reject_req)
    assert reject_res["status"] == "REJECTED"
    assert reject_res["requires_review_before_publish"] is False

    # 3. Test Staged Review (Guarantees content is not auto-published)
    sugg1 = RemediationSuggestion(
        id="sugg_1",
        type=SuggestionType.TERMINOLOGY_CORRECTION,
        original_content="cheap",
        suggested_correction="accessible",
        reason_for_correction="Brand terminology requirement",
        guideline_reference="Terminology Standard KB-01"
    )
    staged = brand_copilot_service.stage_review(
        brand_id="test_copilot_brand",
        accepted_suggestions=[sugg1],
        base_copy="Our cheap cloud solution"
    )
    assert staged.status == "STAGED_FOR_CREATOR_REVIEW"
    assert "NOT be published automatically" in staged.notice
    assert "accessible" in staged.staged_copy


def test_visual_auto_fix_and_decision(tmp_path):
    # Create an off-brand image (neon orange #FF6600 with off-brand properties)
    img_path = tmp_path / "test_offbrand_visual.png"
    img = Image.new("RGB", (200, 200), color=(255, 102, 0))
    img.save(img_path)

    # 1. Run visual Auto-Fix
    res = creative_remediation_service.auto_remediate_image(
        image_path=img_path,
        brand_id="test_copilot_brand"
    )

    # Verify requirements:
    # Problem identified
    assert len(res["visual_problems_identified"]) >= 1
    assert any(p["problem_type"] == "off_brand_color" for p in res["visual_problems_identified"])
    
    # Never overwrite original
    assert Path(img_path).exists()
    assert res["remediated_image_url"] != res["original_image_url"]

    # Elements preserved (text, logos, contours)
    assert len(res["elements_preserved"]) >= 1
    assert "Preserved" in res["elements_preserved"][0]

    # CIELAB color shifted to brand centroid
    assert res["new_delta_e"] < 5.0
    assert res["color_compliance_score"] >= 90.0

    # Human approval required & limitation disclosure
    assert res["requires_human_approval"] is True
    assert "generative_limitation_notice" in res
    assert "AI-assisted visual correction" in res["ai_generated_disclosure"]

    # 2. Test Human Decision (Accept & Reject)
    accept_dec = RemediationDecisionRequest(
        remediation_id=res["remediation_id"],
        brand_id="test_copilot_brand",
        decision="accept",
        reviewed_by="Lead Art Director"
    )
    dec_res = creative_remediation_service.record_decision(accept_dec)
    assert dec_res["status"] == "APPROVED_BY_CREATOR"
    assert dec_res["ready_for_publish"] is False # Never auto-publish
    assert dec_res["staged_for_signoff"] is True


def test_api_routes_copilot_and_remediation(tmp_path):
    client = TestClient(app)

    # 1. Test Chat API
    chat_payload = {
        "brand_id": "test_copilot_brand",
        "message": "Why is 'military-grade' flagged?",
        "copy_text": "Military-grade cloud protection",
        "discrepancies": ["Prohibited claim: military-grade"]
    }
    r = client.post("/api/v1/inspect/test_copilot_brand/copilot-chat", json=chat_payload)
    assert r.status_code == 200
    chat_data = r.json()
    assert "reply" in chat_data
    assert "structured_corrections" in chat_data

    # 2. Test Copilot Action API
    action_payload = {
        "brand_id": "test_copilot_brand",
        "suggestion_id": "sugg_123",
        "action": "accept"
    }
    r2 = client.post("/api/v1/inspect/test_copilot_brand/copilot-action", json=action_payload)
    assert r2.status_code == 200
    assert r2.json()["status"] == "ACCEPTED"

    # 3. Test Remediation Decision API
    dec_payload = {
        "remediation_id": "rem_456",
        "brand_id": "test_copilot_brand",
        "decision": "accept"
    }
    r3 = client.post("/api/v1/inspect/test_copilot_brand/remediation-decision", json=dec_payload)
    assert r3.status_code == 200
    assert r3.json()["status"] == "APPROVED_BY_CREATOR"

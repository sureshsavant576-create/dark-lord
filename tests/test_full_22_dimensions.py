import io
import json
from pathlib import Path
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
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
from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.models.brand_dna import (
    BrandDNAInput,
    BrandDNAProfile,
    BrandDNAStatus,
    BrandDNASynthesis,
    BrandDNAApprovalRequest,
)
from backend.app.models.knowledge_base import (
    KnowledgeCategory,
    KnowledgeItemCreate,
    KnowledgeItemUpdate,
    KnowledgeProvenance,
    KnowledgeSearchQuery,
)
from backend.app.models.workflow import (
    ApprovalDecisionRequest,
    ContentStatus,
    ReviseContentRequest,
    RevisionRequest,
    SubmitContentRequest,
    WorkflowRole,
)
from backend.app.models.claim_verification import (
    ClaimClassification,
    ClaimVerificationRequest,
)
from backend.app.models.content_review import ContentType
from backend.app.models.accessibility import (
    AccessibilityCheckRequest,
    AccessibilityDimension,
    AccessibilitySeverity,
)
from backend.app.models.copilot import (
    CopilotChatRequest,
    SuggestionType,
    SuggestionStatus,
)
from backend.app.models.remediation import RemediationDecisionRequest
from backend.app.services.brand_service import brand_service
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.knowledge_service import knowledge_service
from backend.app.services.copilot_service import brand_copilot_service
from backend.app.services.remediation_service import creative_remediation_service
from backend.app.services.workflow_service import workflow_service
from backend.app.services.audit_service import audit_service
from backend.app.services.accessibility_checker import (
    accessibility_checker,
    calculate_wcag_contrast,
    relative_luminance,
)
from backend.app.services.ocr_service import ocr_service
from backend.app.preprocessing.color_extractor import extract_color_palette
from backend.app.preprocessing.image_processor import process_image_metadata
from backend.app.services.opencv_analyzer import opencv_analyzer


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    # Setup isolated test brand
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

    # Seed knowledge items for claim verification and co-pilot
    knowledge_service.seed_enterprise_knowledge_base("test_master_brand", "test_master_brand")

    yield test_brand

    try:
        brand_service.delete_brand_profile("test_master_brand")
    except Exception:
        pass


# ===========================================================================
# 1. BRAND DNA GENERATION
# ===========================================================================
@pytest.mark.asyncio
async def test_01_brand_dna_generation():
    """Tests 10-dimension input collection and 13-point structured Brand DNA synthesis."""
    dna_input = BrandDNAInput(
        company_name="Vanguard Robotics",
        industry="Autonomous Industrial Logistics",
        business_description="Building zero-collision autonomous mobile robots for aerospace supply chains.",
        products_and_services="Vanguard AMR-500, NavMesh Fleet Orchestrator",
        target_audience="Warehouse Operations Directors and Logistics VPs",
        company_values="Zero Collisions, Deterministic Precision, Human-Centric Safety",
        brand_positioning="The most dependable autonomous mobile fleet engine in high-stakes manufacturing.",
        desired_customer_perception="Heavy-duty, rock-solid, ultra-reliable, sophisticated",
        communication_personality="Clear, precise, authoritative, mission-focused",
        reference_brands="Boston Dynamics, KUKA, FANUC"
    )
    profile = await brand_dna_service.generate_brand_dna(dna_input)

    assert isinstance(profile, BrandDNAProfile)
    assert profile.company_name == "Vanguard Robotics"
    assert profile.status == BrandDNAStatus.DRAFT_PENDING_APPROVAL
    assert profile.is_approved is False
    assert profile.approved_at is None
    assert profile.company_facts.company_name == "Vanguard Robotics"
    assert profile.company_facts.source == "company_provided"

    # All 13 structured recommendations synthesized
    rec = profile.ai_recommendations
    assert rec.source == "ai_synthesized"
    assert len(rec.brand_personality) > 0
    assert len(rec.brand_positioning) > 0
    assert "primary_voice" in rec.brand_voice_and_tone
    assert len(rec.colour_hex_codes) >= 3
    assert "headline_font" in rec.typography_recommendations
    assert "style_ethos" in rec.visual_identity
    assert len(rec.photography_preferences) > 0
    assert "corner_radius" in rec.design_language
    assert len(rec.messaging_guidelines) > 0
    assert len(rec.preferred_terminology) > 0
    assert len(rec.words_to_avoid) > 0
    assert "dos" in rec.visual_dos_and_donts
    assert "donts" in rec.visual_dos_and_donts

    # Clean up
    brand_dna_service.delete_dna_profile(profile.dna_id)


# ===========================================================================
# 2. BRAND DNA EDITING AND APPROVAL
# ===========================================================================
@pytest.mark.asyncio
async def test_02_brand_dna_editing_and_approval():
    """Tests editing draft DNA fields, approving, locking, and activating."""
    dna_input = BrandDNAInput(
        company_name="Apex Global",
        industry="Enterprise Fintech",
        business_description="Democratizing institutional liquidity and programmatic risk management.",
        products_and_services="Apex Core Ledger, Liquidity Bridge",
        target_audience="Fintech CTOs and Treasury Directors",
        company_values="Integrity, Precision, Transparency",
        brand_positioning="The rock-solid settlement layer for global capital.",
        desired_customer_perception="Institutional-grade, trustworthy, cutting-edge",
        communication_personality="Direct, pragmatic, authoritative",
        reference_brands="Stripe, Bloomberg"
    )
    draft_dna = await brand_dna_service.generate_brand_dna(dna_input)
    assert draft_dna.status == BrandDNAStatus.DRAFT_PENDING_APPROVAL
    assert draft_dna.is_approved is False

    # 1. Edit draft fields before approval
    edited_synthesis = draft_dna.ai_recommendations
    edited_synthesis.words_to_avoid.append("Hyper-growth gimmick")
    edited_synthesis.colour_hex_codes[0] = "#0052CC"
    updated_dna = brand_dna_service.update_draft_dna(draft_dna.dna_id, edited_synthesis)
    assert "Hyper-growth gimmick" in updated_dna.ai_recommendations.words_to_avoid
    assert updated_dna.ai_recommendations.colour_hex_codes[0] == "#0052CC"
    assert updated_dna.status == BrandDNAStatus.DRAFT_PENDING_APPROVAL

    # 2. Approve and activate Brand DNA Profile
    approval_req = BrandDNAApprovalRequest(
        approved_by="Marcus Vance (Brand Director)",
        approval_notes="Approved and verified corporate brand standard.",
        sync_to_platform_brand=True
    )
    approved_dna = await brand_dna_service.approve_and_activate_brand_dna(draft_dna.dna_id, approval_req)
    assert approved_dna.status == BrandDNAStatus.ACTIVE
    assert approved_dna.is_approved is True
    assert approved_dna.approved_by == "Marcus Vance (Brand Director)"
    assert approved_dna.approved_at is not None

    # Clean up
    brand_dna_service.delete_dna_profile(draft_dna.dna_id)


# ===========================================================================
# 3. KNOWLEDGE BASE STORAGE AND RETRIEVAL
# ===========================================================================
def test_03_knowledge_base_storage_and_retrieval(client):
    """Tests creating, querying, updating with version changelog, and semantic search."""
    item_in = KnowledgeItemCreate(
        org_id="test_master_brand",
        brand_id="test_master_brand",
        category=KnowledgeCategory.COMPANY_FACT,
        title="ISO 27001 Certification Fact",
        content="MasterBrand Systems is ISO/IEC 27001:2022 certified across all global data centers.",
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True,
        tags=["iso27001", "certification", "compliance"]
    )
    item = knowledge_service.create_item(item_in)
    assert item.item_id is not None
    assert item.version == 1

    # Retrieval
    retrieved = knowledge_service.get_item(item.item_id, "test_master_brand")
    assert retrieved is not None
    assert retrieved.title == "ISO 27001 Certification Fact"

    # Version bump & history
    update_in = KnowledgeItemUpdate(
        content="MasterBrand Systems is ISO/IEC 27001:2022 and SOC 2 Type II certified globally.",
        change_reason="Added SOC 2 Type II audit confirmation.",
        changed_by="Compliance Auditor"
    )
    updated = knowledge_service.update_item(item.item_id, "test_master_brand", update_in)
    assert updated.version == 2

    # Check history snapshot
    history = knowledge_service.get_version_history(item.item_id, "test_master_brand")
    assert len(history) >= 1
    assert history[0].version == 1

    # Semantic search via pgvector embedding similarity
    search_q = KnowledgeSearchQuery(
        query="ISO 27001 certified",
        org_id="test_master_brand"
    )
    search_res = knowledge_service.search_knowledge_base(search_q)
    assert len(search_res) >= 1
    assert any("27001" in r.item.content for r in search_res)


# ===========================================================================
# 4. COMPANY DATA ISOLATION
# ===========================================================================
def test_04_company_data_isolation():
    """Tests multi-tenant data separation and cross-tenant boundary protections."""
    # Create item for org_A
    item_a = knowledge_service.create_item(KnowledgeItemCreate(
        org_id="tenant_alpha",
        brand_id="tenant_alpha",
        category=KnowledgeCategory.COMPANY_FACT,
        title="Alpha Secret Formula",
        content="Confidential formula proprietary to Tenant Alpha.",
        provenance=KnowledgeProvenance.COMPANY_FACT,
        is_approved=True
    ))

    # Query org_B
    items_b = knowledge_service.list_items("tenant_beta")
    assert not any(i.item_id == item_a.item_id for i in items_b)

    # Cross-tenant boundary check
    with pytest.raises(TenantIsolationViolationError):
        verify_tenant_isolation("tenant_alpha", "tenant_beta")

    # Filesystem separation
    path_a = get_tenant_storage_path("tenant_alpha")
    path_b = get_tenant_storage_path("tenant_beta")
    assert path_a != path_b
    assert "tenant_alpha" in str(path_a)
    assert "tenant_beta" in str(path_b)


# ===========================================================================
# 5. TEXT UPLOADS & AUDIT
# ===========================================================================
def test_05_text_uploads(client):
    """Tests marketing text submissions and compliance audit."""
    payload = {
        "org_id": "test_master_brand",
        "brand_id": "test_master_brand",
        "content_type": ContentType.TEXT.value,
        "copy_text": "MasterBrand delivers enterprise cloud security with 99.99% uptime."
    }
    res = client.post("/api/v1/reviews/audit", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "review_id" in data
    assert "overall_score" in data
    assert "is_approved" in data
    assert data["brand_id"] == "test_master_brand"


# ===========================================================================
# 6. POSTER UPLOADS & MAGIC BYTES
# ===========================================================================
def test_06_poster_uploads(client, tmp_path):
    """Tests image poster upload with magic-bytes verification."""
    # Generate real PNG image
    img = Image.new("RGB", (300, 300), color=(0, 82, 204))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    files = {"file": ("banner.png", png_bytes, "image/png")}
    data = {
        "brand_id": "test_master_brand",
        "org_id": "test_master_brand",
        "content_type": ContentType.POSTER_IMAGE.value
    }
    res = client.post("/api/v1/reviews/upload", files=files, data=data)
    assert res.status_code == 200
    report = res.json()
    assert report["review_id"] is not None
    assert report["overall_score"] >= 0.0
    assert "detected_issues" in report


# ===========================================================================
# 7. PDF UPLOADS
# ===========================================================================
def test_07_pdf_uploads(client):
    """Tests PDF guideline/creative document upload and parsing."""
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
    
    files = {"file": ("creative_deck.pdf", pdf_bytes, "application/pdf")}
    data = {
        "brand_id": "test_master_brand",
        "org_id": "test_master_brand",
        "content_type": ContentType.PDF.value
    }
    res = client.post("/api/v1/reviews/upload", files=files, data=data)
    assert res.status_code == 200
    report = res.json()
    assert report["review_id"] is not None


# ===========================================================================
# 8. OCR EXTRACTION
# ===========================================================================
def test_08_ocr_extraction(tmp_path):
    """Tests Tesseract OCR text extraction pipeline."""
    img_path = tmp_path / "ocr_test.png"
    img = Image.new("RGB", (400, 100), color=(255, 255, 255))
    img.save(img_path)

    res = ocr_service.extract_text(img_path)
    assert "text" in res
    assert "method" in res
    assert isinstance(res["text"], str)


# ===========================================================================
# 9. VISUAL ANALYSIS
# ===========================================================================
def test_09_visual_analysis(tmp_path):
    """Tests OpenCV and ColorThief visual properties extraction."""
    img_path = tmp_path / "vis_test.png"
    img = Image.new("RGB", (250, 250), color=(0, 82, 204))
    img.save(img_path)

    # Palette
    palette = extract_color_palette(img_path, color_count=3)
    assert len(palette.palette) >= 1
    assert palette.palette[0].hex_code.startswith("#")

    # Dimensions, aspect ratio
    meta = process_image_metadata(img_path)
    assert meta.width == 250
    assert meta.height == 250
    assert meta.aspect_ratio_decimal == 1.0


# ===========================================================================
# 10. BRAND CONSISTENCY CHECKING
# ===========================================================================
def test_10_brand_consistency_checking(client):
    """Tests detection of off-brand color drift, prohibited terms, and messaging mismatches."""
    payload = {
        "org_id": "test_master_brand",
        "brand_id": "test_master_brand",
        "content_type": ContentType.TEXT.value,
        "copy_text": "Our cheap servers are unhackable and guaranteed bug-free."
    }
    res = client.post("/api/v1/reviews/audit", json=payload)
    assert res.status_code == 200
    report = res.json()

    # Disallowed words must be detected
    issues = report["detected_issues"]
    assert len(issues) >= 1
    assert any("cheap" in str(iss["description"]).lower() or "unhackable" in str(iss["description"]).lower() for iss in issues)


# ===========================================================================
# 11. CLAIM VERIFICATION
# ===========================================================================
def test_11_claim_verification(client):
    """Tests detection and 5-state classification of promotional claims."""
    payload = {
        "org_id": "test_master_brand",
        "brand_id": "test_master_brand",
        "text": "We are #1 in cloud uptime. Guaranteed 100% bug-free infrastructure. MasterBrand Systems is ISO/IEC 27001:2022 certified across all global data centers.",
        "require_strict_evidence": True
    }
    res = client.post("/api/v1/claims/verify", json=payload)
    assert res.status_code == 200
    report = res.json()

    assert report["total_claims_detected"] >= 2
    assert report["requires_human_review"] is True
    findings = report["findings"]
    assert len(findings) >= 2

    # Superlatives without pre-approved evidence require human sign-off
    unsupported = [
        f for f in findings 
        if f["classification"] in (
            ClaimClassification.UNSUPPORTED.value,
            ClaimClassification.REQUIRES_HUMAN_VERIFICATION.value
        )
    ]
    assert len(unsupported) >= 1
    assert unsupported[0]["requires_human_review"] is True


# ===========================================================================
# 12. ACCESSIBILITY CHECKING
# ===========================================================================
def test_12_accessibility_checking():
    """Tests WCAG 2.1 contrast math and readability analysis."""
    white = (255, 255, 255)
    black = (0, 0, 0)
    navy = (11, 19, 43)

    assert relative_luminance(white) == 1.0
    assert relative_luminance(black) == 0.0

    # Black on white is 21:1
    contrast_bw = calculate_wcag_contrast(white, black)
    assert contrast_bw == 21.0

    # Navy on white should exceed 10:1
    contrast_navy_white = calculate_wcag_contrast(white, navy)
    assert contrast_navy_white >= 10.0

    # Readability analysis
    simple_copy = "We protect your data. Our cloud is fast, secure, and easy to use."
    ease, grade, level = accessibility_checker._calculate_readability(simple_copy)
    assert ease >= 70.0
    assert grade <= 6.0
    assert "Plain English" in level


# ===========================================================================
# 13. BRAND CO-PILOT CONVERSATIONS
# ===========================================================================
@pytest.mark.asyncio
async def test_13_brand_copilot_conversations():
    """Tests interactive Brand Co-Pilot conversation grounded in Brand DNA."""
    req = CopilotChatRequest(
        brand_id="test_master_brand",
        message="Why was the term 'cheap' rejected in our marketing campaign?",
        copy_text="Our cheap cloud solution",
        discrepancies=["Disallowed terminology: cheap"]
    )
    res = await brand_copilot_service.chat(req)
    assert res.brand_name == "MasterBrand Systems"
    assert len(res.reply) > 20
    assert len(res.context_sources_used) >= 1


# ===========================================================================
# 14. COPY CORRECTION SUGGESTIONS
# ===========================================================================
@pytest.mark.asyncio
async def test_14_copy_correction_suggestions():
    """Tests Co-Pilot generation of approved headlines and tone rewrites."""
    req = CopilotChatRequest(
        brand_id="test_master_brand",
        message="Suggest 3 compliant headlines in brand tone",
        copy_text="Try to buy our cheap cloud servers",
        intent="headlines"
    )
    res = await brand_copilot_service.chat(req)
    headlines = [c for c in res.structured_corrections if c.type == SuggestionType.HEADLINE]
    assert len(headlines) >= 1
    assert headlines[0].suggested_correction != ""
    assert headlines[0].reason_for_correction != ""


# ===========================================================================
# 15. AUTO-FIX FUNCTIONALITY
# ===========================================================================
def test_15_autofix_functionality(tmp_path):
    """Tests visual Auto-Fix with CIELAB centroid recoloring."""
    img_path = tmp_path / "autofix_input.png"
    img = Image.new("RGB", (150, 150), color=(255, 30, 0))  # Off-brand bright red
    img.save(img_path)

    res = creative_remediation_service.auto_remediate_image(
        image_path=img_path,
        brand_id="test_master_brand"
    )
    assert res["remediated_image_url"] is not None
    assert res["new_delta_e"] < 15.0
    assert res["requires_human_approval"] is True


# ===========================================================================
# 16. ORIGINAL AND CORRECTED IMAGE PRESERVATION
# ===========================================================================
def test_16_image_preservation(tmp_path):
    """Verifies that original creative is never overwritten and changes require human approval."""
    img_path = tmp_path / "preserve_test.png"
    img = Image.new("RGB", (100, 100), color=(255, 100, 50))
    img.save(img_path)
    original_size = img_path.stat().st_size

    res = creative_remediation_service.auto_remediate_image(
        image_path=img_path,
        brand_id="test_master_brand"
    )
    # Original file is intact
    assert img_path.exists()
    assert img_path.stat().st_size == original_size

    # Remediated version is saved separately
    remed_path = Path(res["remediated_image_url"].lstrip("/"))
    assert str(img_path.resolve()) != str(remed_path.resolve())


# ===========================================================================
# 17. DRAG-AND-DROP PRE-FLIGHT SCANNER
# ===========================================================================
def test_17_preflight_scanner(client, tmp_path):
    """Tests instant preflight scanner telemetry before backend submit."""
    img = Image.new("RGB", (200, 200), color=(0, 82, 204))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    files = {"file": ("preflight.png", buf.getvalue(), "image/png")}
    res = client.post("/api/v1/inspect/preflight-scan", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "PREFLIGHT_DIAGNOSED"
    assert data["is_preliminary"] is True
    assert "dimensions" in data
    assert data["dimensions"]["width"] == 200
    assert "aspect_ratio" in data
    assert "color_temperature" in data
    assert "contrast" in data
    assert "whitespace" in data
    assert "dominant_swatches" in data
    assert len(data["dominant_swatches"]) >= 1
    assert "predicted_style" in data
    assert "style" in data["predicted_style"]


# ===========================================================================
# 18. APPROVAL WORKFLOWS
# ===========================================================================
def test_18_approval_workflows():
    """Tests full lifecycle: submit, request revision, revise version, approve."""
    # 1. Submit
    item = workflow_service.submit_content(SubmitContentRequest(
        org_id="test_master_brand",
        brand_id="test_master_brand",
        title="Spring Ad Campaign v1",
        content_text="Reliable cloud performance with 99.99% SLA.",
        user_id="creator_1",
        user_name="Elena Designer",
        user_role=WorkflowRole.CREATOR
    ))
    assert item.status == ContentStatus.UNDER_REVIEW
    assert item.current_version == 1

    # 2. Request Revision
    revised_item = workflow_service.request_revision(
        item.item_id,
        "test_master_brand",
        RevisionRequest(
            user_id="mgr_1",
            user_name="Marcus Manager",
            user_role=WorkflowRole.MANAGER,
            feedback="Please add citation for 99.99% SLA."
        )
    )
    assert revised_item.status == ContentStatus.NEEDS_REVISION

    # 3. Submit Revision v2
    v2_item = workflow_service.submit_revision(
        item.item_id,
        "test_master_brand",
        ReviseContentRequest(
            content_text="Reliable cloud performance with 99.99% SLA verified by independent audit.",
            change_summary="Added audit citation.",
            user_id="creator_1",
            user_name="Elena Designer",
            user_role=WorkflowRole.CREATOR
        )
    )
    assert v2_item.current_version == 2
    assert v2_item.status == ContentStatus.UNDER_REVIEW

    # 4. Approve
    approved_item = workflow_service.record_decision(
        item.item_id,
        "test_master_brand",
        ApprovalDecisionRequest(
            user_id="auth_rev_1",
            user_name="Sarah Reviewer",
            user_role=WorkflowRole.AUTHORISED_REVIEWER,
            decision="approve",
            notes="Audit citation verified."
        )
    )
    assert approved_item.status == ContentStatus.APPROVED


# ===========================================================================
# 19. USER PERMISSIONS AND RBAC
# ===========================================================================
def test_19_user_permissions_and_rbac():
    """Tests RBAC enforcement and escalation gates."""
    # Creator cannot approve content
    assert check_role_permission(UserRole.CREATOR, "approve_review") is False
    assert check_role_permission(UserRole.AUTHORISED_REVIEWER, "approve_review") is True

    # Creator clearance
    assert check_role_clearance(UserRole.CREATOR, ConfidentialityLevel.CONFIDENTIAL) is False
    assert check_role_clearance(UserRole.ADMINISTRATOR, ConfidentialityLevel.RESTRICTED) is True

    # Manager cannot approve ESCALATED high-risk item
    esc_item = workflow_service.submit_content(SubmitContentRequest(
        org_id="test_master_brand",
        brand_id="test_master_brand",
        title="High-Risk Superlative Ad",
        content_text="Certified #1 fastest cloud globally.",
        user_id="creator_1",
        user_name="Elena",
        user_role=WorkflowRole.CREATOR,
        has_high_risk_claims=True
    ))
    assert esc_item.status == ContentStatus.ESCALATED

    with pytest.raises(PermissionError):
        workflow_service.record_decision(
            esc_item.item_id,
            "test_master_brand",
            ApprovalDecisionRequest(
                user_id="mgr_1",
                user_name="Marcus Manager",
                user_role=WorkflowRole.MANAGER,
                decision="approve"
            )
        )


# ===========================================================================
# 20. AUDIT LOGS
# ===========================================================================
def test_20_audit_logs(client):
    """Tests immutable audit logging and query summary."""
    res = client.get("/api/v1/audit/logs?org_id=test_master_brand&user_role=Administrator")
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)

    summary_res = client.get("/api/v1/audit/summary?org_id=test_master_brand&user_role=Administrator")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert "total_events" in summary
    assert "by_event_type" in summary


# ===========================================================================
# 21. API ERROR HANDLING
# ===========================================================================
def test_21_api_error_handling(client):
    """Tests magic-bytes blocking of executables and shielded error traces."""
    # Block disguised executable
    bad_png = b"MZ\x90\x00\x03\x00\x00\x00"
    res = client.post(
        "/api/v1/reviews/upload",
        files={"file": ("exploit.png", bad_png, "image/png")},
        data={"brand_id": "test_master_brand", "org_id": "test_master_brand"}
    )
    assert res.status_code == 400
    assert "rejected" in res.json()["detail"].lower()

    # Zero stack trace leaks
    detail_str = str(res.json()["detail"])
    assert "Traceback" not in detail_str
    assert "backend/app" not in detail_str


# ===========================================================================
# 22. RESPONSIVE LAYOUTS & STATIC ASSETS
# ===========================================================================
def test_22_responsive_layouts_and_assets(client):
    """Verifies that all frontend pages exist, have responsive viewports, and serve HTTP 200."""
    routes = ["/", "/check-vibe", "/company-portal", "/account"]
    for route in routes:
        res = client.get(route)
        assert res.status_code == 200
        html = res.text
        # Responsive viewport directive
        assert '<meta name="viewport" content="width=device-width, initial-scale=1.0">' in html
        # Core styling reference
        assert 'style.css' in html
        # Core application script reference
        assert 'app.js' in html

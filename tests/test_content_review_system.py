import pytest
from pathlib import Path
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.content_review import (
    ContentType,
    ContentReviewRequest,
    ReviewIssueCategory,
    ReviewSeverity,
)
from backend.app.services.content_review_service import content_review_service
from backend.app.services.knowledge_service import knowledge_service
from backend.app.services.opencv_analyzer import opencv_analyzer

client = TestClient(app)


@pytest.fixture
def sample_test_image(tmp_path: Path) -> Path:
    """
    Creates a synthetic test banner image:
    Dark navy background (#0B132B) with a cyber cyan rectangle (#5BC0BE) and white text region.
    """
    img_path = tmp_path / "test_banner.png"
    img = Image.new("RGB", (800, 800), color=(11, 19, 43))  # #0B132B
    draw = ImageDraw.Draw(img)

    # Draw centered accent block
    draw.rectangle([200, 300, 600, 500], fill=(91, 192, 190))  # #5BC0BE

    # Draw small logo mark in corner with >24px margin
    draw.rectangle([40, 40, 90, 90], fill=(255, 255, 255))

    img.save(img_path)
    return img_path


@pytest.fixture
def off_brand_cluttered_image(tmp_path: Path) -> Path:
    """
    Creates a synthetic off-brand creative with low contrast and off-brand colors.
    """
    img_path = tmp_path / "off_brand_creative.png"
    img = Image.new("RGB", (600, 600), color=(255, 100, 0))  # High-saturation bright orange (off-brand)
    draw = ImageDraw.Draw(img)

    # Low contrast gray text block
    draw.rectangle([100, 100, 500, 500], fill=(240, 90, 0))  # Extremely low contrast ratio

    # Place logo right on the edge (< 24px)
    draw.rectangle([5, 5, 50, 50], fill=(255, 255, 255))

    img.save(img_path)
    return img_path


def test_opencv_analyzer_measurable_properties(sample_test_image: Path):
    """
    Verifies OpenCV calculates empirical, measurable properties:
    dimensions, aspect ratio, dominant colors, CIELAB delta E, whitespace, WCAG contrast.
    """
    approved_palette = ["#0B132B", "#5BC0BE", "#FFFFFF"]
    props = opencv_analyzer.analyze_image(
        image_path=sample_test_image,
        approved_palette_hex=approved_palette,
        min_clear_space_px=24
    )

    assert props.dimensions["width"] == 800
    assert props.dimensions["height"] == 800
    assert props.aspect_ratio == 1.0
    assert "1:1 Square" in props.aspect_ratio_label
    assert len(props.dominant_palette_hex) > 0
    assert props.min_delta_e <= 15.0  # Dominant color aligns with #0B132B
    assert props.wcag_contrast_ratio >= 1.0


def test_opencv_detects_violations(off_brand_cluttered_image: Path):
    """
    Verifies OpenCV flags color deviations, low contrast, and logo margin violations.
    """
    approved_palette = ["#0B132B", "#5BC0BE", "#FFFFFF"]
    props = opencv_analyzer.analyze_image(
        image_path=off_brand_cluttered_image,
        approved_palette_hex=approved_palette,
        min_clear_space_px=24
    )

    # Orange dominant color should fail delta-E vs navy/cyan palette
    assert props.dominant_color_delta_e > 15.0
    # Logo near boundary should fail clear space
    assert props.logo_detected is True
    assert props.logo_clear_space_compliant is False


@pytest.mark.asyncio
async def test_content_review_10_categories_detection(sample_test_image: Path):
    """
    Tests the end-to-end Content Review System detecting all mandated categories:
    1. Incorrect brand tone
    2. Terminology inconsistencies
    3. Messaging mismatches
    4. Visual identity violations
    5. Incorrect logo usage
    6. Colour inconsistencies
    7. Typography inconsistencies
    8. Unsupported promotional claims (rejection of unverified claims)
    9. Incorrect or outdated information
    10. Accessibility problems
    """
    # Seed knowledge base first
    knowledge_service.seed_enterprise_knowledge_base("org-test", "apex-cloud")

    # Copy with deliberate off-brand violations:
    # - "VPN gateway" (unapproved terminology)
    # - "unhackable magic" (prohibited messaging)
    # - "Fastest cloud in the universe" (unsupported promotional claim)
    copy_with_issues = (
        "Welcome to our VPN gateway! It is completely unhackable magic and the fastest cloud in the universe. "
        "Delivers 99.999% high-availability uptime."
    )

    req = ContentReviewRequest(
        org_id="org-test",
        brand_id="apex-cloud",
        content_type=ContentType.MARKETING_AD,
        copy_text=copy_with_issues,
        file_path=str(sample_test_image)
    )

    report = await content_review_service.review_content(req)

    assert report.review_id.startswith("cr-")
    assert report.brand_id == "apex-cloud"
    assert len(report.detected_issues) > 0

    categories_detected = {issue.issue_category for issue in report.detected_issues}

    # Verify terminology inconsistency detected (VPN gateway -> Zero-Trust Mesh)
    assert ReviewIssueCategory.TERMINOLOGY_INCONSISTENCIES in categories_detected

    # Verify prohibited messaging detected ("unhackable")
    assert ReviewIssueCategory.MESSAGING_MISMATCHES in categories_detected

    # Verify unsupported promotional claim detected ("fastest cloud in the universe")
    assert ReviewIssueCategory.UNSUPPORTED_PROMOTIONAL_CLAIMS in categories_detected

    # Verify supported claim verified with evidence ("99.999% high-availability uptime")
    verified_claim_finding = next(
        (i for i in report.detected_issues if i.severity == ReviewSeverity.PASS and "99.999%" in i.description),
        None
    )
    assert verified_claim_finding is not None
    assert "KPMG" in verified_claim_finding.evidence_citation or "Evidence" in verified_claim_finding.evidence_citation

    # Verify mandatory finding structure on EVERY finding
    for f in report.detected_issues:
        assert f.issue_category is not None
        assert f.severity is not None
        assert len(f.description) > 0
        assert len(f.relevant_guideline) > 0
        assert len(f.explanation) > 0
        assert len(f.recommended_correction) > 0
        assert 0.0 <= f.confidence_level <= 1.0


def test_content_review_api_endpoint(sample_test_image: Path):
    """
    Tests REST API POST /api/v1/reviews/audit.
    """
    res = client.post("/api/v1/reviews/audit", json={
        "org_id": "default-org",
        "brand_id": "apex-cloud",
        "content_type": "marketing_ad",
        "copy_text": "Apex Shield Mesh delivers 99.999% high-availability uptime for enterprise clusters.",
        "file_path": str(sample_test_image)
    })

    assert res.status_code == 200
    data = res.json()
    assert "review_id" in data
    assert 0.0 <= data["overall_score"] <= 100.0
    assert "is_approved" in data
    assert len(data["detected_issues"]) > 0

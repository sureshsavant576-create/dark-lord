import pytest
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.accessibility import (
    AccessibilityCheckRequest,
    AccessibilityDimension,
    AccessibilityIssue,
    AccessibilitySeverity,
)
from backend.app.services.accessibility_checker import (
    accessibility_checker,
    calculate_wcag_contrast,
    count_syllables,
    relative_luminance,
)

client = TestClient(app)


@pytest.fixture
def accessible_banner_image(tmp_path: Path) -> Path:
    """
    Creates an accessible test banner:
    High contrast dark navy (#0B132B) background with clear white (#FFFFFF) text block.
    """
    img_path = tmp_path / "accessible_banner.png"
    img = Image.new("RGB", (800, 600), color=(11, 19, 43))  # #0B132B
    draw = ImageDraw.Draw(img)

    # Large prominent white text blocks (>16px height)
    draw.rectangle([100, 200, 500, 240], fill=(255, 255, 255))
    draw.rectangle([100, 280, 450, 310], fill=(255, 255, 255))

    img.save(img_path)
    return img_path


@pytest.fixture
def inaccessible_contrast_image(tmp_path: Path) -> Path:
    """
    Creates an inaccessible test banner:
    Low contrast light gray on white, failing WCAG 2.1 AA (contrast < 4.5:1).
    """
    img_path = tmp_path / "inaccessible_banner.png"
    img = Image.new("RGB", (600, 600), color=(255, 255, 255))  # White background
    draw = ImageDraw.Draw(img)

    # Low contrast very light gray block
    draw.rectangle([100, 100, 500, 500], fill=(230, 230, 230))  # Contrast ~1.2:1

    img.save(img_path)
    return img_path


def test_wcag_relative_luminance_and_contrast_math():
    """
    Tests mathematical adherence to W3C WCAG 2.1 relative luminance and contrast formula.
    """
    white = (255, 255, 255)
    black = (0, 0, 0)
    navy = (11, 19, 43)

    assert relative_luminance(white) == 1.0
    assert relative_luminance(black) == 0.0

    # Black on white is 21:1
    contrast_bw = calculate_wcag_contrast(white, black)
    assert contrast_bw == 21.0

    # Navy on white should exceed 10:1 (satisfying AA and AAA)
    contrast_navy_white = calculate_wcag_contrast(white, navy)
    assert contrast_navy_white >= 10.0


def test_readability_metrics():
    """
    Evaluates Flesch Reading Ease and Flesch-Kincaid Grade Level formulas.
    """
    simple_copy = "We protect your data. Our cloud is fast, secure, and easy to use."
    ease, grade, level = accessibility_checker._calculate_readability(simple_copy)

    assert ease >= 70.0
    assert grade <= 6.0
    assert "Plain English" in level


@pytest.mark.asyncio
async def test_accessibility_evaluation_accessible_banner(accessible_banner_image: Path):
    """
    Evaluates 6 dimensions on an accessible creative with provided alt text.
    Verifies Rule: Do not report an accessibility requirement as passed unless it has actually been checked.
    """
    req = AccessibilityCheckRequest(
        file_path=str(accessible_banner_image),
        text_copy="Apex Shield Mesh delivers real-time zero-trust cloud security.",
        provided_alt_text="Promotional banner displaying Apex Shield Mesh zero-trust cloud security platform.",
        target_wcag_level="AA"
    )

    report = await accessibility_checker.evaluate_accessibility(req)

    assert report.report_id.startswith("acc-")
    assert report.overall_score >= 70.0
    assert report.is_accessible is True
    assert report.wcag_conformance_level in ["WCAG_2_1_AA", "WCAG_2_1_AAA", "WCAG_2_1_A"]

    # Verify all 6 dimensions are checked
    checked_dim_names = {d["dimension"] for d in report.dimensions_checked}
    assert "colour_contrast" in checked_dim_names
    assert "text_readability" in checked_dim_names
    assert "text_visibility" in checked_dim_names
    assert "font_size" in checked_dim_names
    assert "image_alt_text" in checked_dim_names
    assert "basic_content_accessibility" in checked_dim_names

    # Strict Rule: Check every issue has checked=True
    for iss in report.issues:
        assert iss.checked is True
        assert len(iss.explanation) > 0
        assert len(iss.recommended_correction) > 0


@pytest.mark.asyncio
async def test_accessibility_detects_contrast_failure_and_missing_alt(inaccessible_contrast_image: Path):
    """
    Evaluates contrast failure (< 4.5:1) and missing image alternative text.
    """
    req = AccessibilityCheckRequest(
        file_path=str(inaccessible_contrast_image),
        text_copy="Incomprehensible multi-syllabic obfuscation demonstrating disproportionate cognitive overload.",
        provided_alt_text=None  # Missing alt text!
    )

    report = await accessibility_checker.evaluate_accessibility(req)

    # 1. Contrast should fail WCAG AA
    contrast_issue = next(
        (i for i in report.issues if i.dimension == AccessibilityDimension.COLOUR_CONTRAST),
        None
    )
    assert contrast_issue is not None
    assert contrast_issue.severity == AccessibilitySeverity.CRITICAL
    assert "Contrast Failure" in contrast_issue.title

    # 2. Missing Alt Text should be detected and synthesized
    alt_issue = next(
        (i for i in report.issues if i.dimension == AccessibilityDimension.IMAGE_ALT_TEXT),
        None
    )
    assert alt_issue is not None
    assert alt_issue.severity == AccessibilitySeverity.WARNING
    assert "Missing" in alt_issue.title
    assert report.metrics.generated_alt_text is not None


def test_accessibility_api_endpoints(accessible_banner_image: Path):
    """
    Tests REST API endpoints for accessibility checking.
    """
    res = client.post("/api/v1/accessibility/check", json={
        "file_path": str(accessible_banner_image),
        "text_copy": "Apex Cloud protects mission critical workloads.",
        "provided_alt_text": "Dark navy marketing banner highlighting cloud protection."
    })

    assert res.status_code == 200
    data = res.json()
    assert "report_id" in data
    assert 0.0 <= data["overall_score"] <= 100.0
    assert len(data["dimensions_checked"]) >= 5
    assert len(data["issues"]) > 0

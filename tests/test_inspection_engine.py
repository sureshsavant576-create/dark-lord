from pathlib import Path
from PIL import Image
import pytest

from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.models.inspection import (
    FindingCategory,
    FindingSeverity,
    HumanReviewSubmission,
    InspectionVerdict,
)
from backend.app.services.brand_service import BrandService
from backend.app.services.inspection_service import InspectionService

@pytest.fixture
def test_setup(tmp_path: Path):
    brand_svc = BrandService(db_path=tmp_path / "brands.json")
    insp_svc = InspectionService(db_path=tmp_path / "reports.json", brand_svc=brand_svc)

    profile = BrandProfile(
        brand_id="zenith-labs",
        brand_name="Zenith Labs",
        status=ProfileStatus.CONFIRMED,
        personality=["Innovative", "Reliable"],
        mood=["Inspiring", "Focused"],
        communication_tone=["Professional", "Clear"],
        visual_style=["Minimalist", "Modern"],
        target_audience="Enterprise Developers",
        approved_palette=["#0055FF", "#FFFFFF", "#111111"],
        disallowed_elements=["cheap", "revolutionary", "crypto"],
        is_human_confirmed=True
    )
    brand_svc.save_brand_profile(profile)
    return brand_svc, insp_svc

@pytest.mark.asyncio
async def test_on_brand_poster_inspection(test_setup, tmp_path: Path):
    _, insp_svc = test_setup

    img_path = tmp_path / "zenith_banner.png"
    Image.new("RGB", (1200, 630), color=(0, 85, 255)).save(img_path)

    report = await insp_svc.inspect_submission(
        brand_id="zenith-labs",
        file_path=img_path
    )

    assert report.brand_id == "zenith-labs"
    assert report.verdict in [InspectionVerdict.APPROVED, InspectionVerdict.REQUIRES_HUMAN_REVIEW]
    assert report.deterministic_score >= 80.0
    color_findings = [f for f in report.findings if f.category == FindingCategory.COLOR]
    assert any(f.severity == FindingSeverity.PASS for f in color_findings)

@pytest.mark.asyncio
async def test_off_brand_color_mismatch(test_setup, tmp_path: Path):
    _, insp_svc = test_setup

    img_path = tmp_path / "red_poster.png"
    Image.new("RGB", (800, 800), color=(255, 0, 0)).save(img_path)

    report = await insp_svc.inspect_submission(
        brand_id="zenith-labs",
        file_path=img_path
    )

    assert report.brand_id == "zenith-labs"
    assert report.verdict in [InspectionVerdict.CHANGES_REQUESTED, InspectionVerdict.REJECTED]
    assert len(report.guideline_violations) > 0
    color_findings = [f for f in report.findings if f.category == FindingCategory.COLOR]
    assert any(f.severity in [FindingSeverity.WARNING, FindingSeverity.CRITICAL] for f in color_findings)
    assert any("Off-brand" in v or "deviates" in v for v in report.guideline_violations + report.mismatches)

@pytest.mark.asyncio
async def test_disallowed_terminology_detection(test_setup, tmp_path: Path):
    _, insp_svc = test_setup

    copy_path = tmp_path / "promo_copy.txt"
    copy_path.write_text(
        "Zenith Labs announces a revolutionary cheap solution for cloud data pipelines. Sign up today!",
        encoding="utf-8"
    )

    report = await insp_svc.inspect_submission(
        brand_id="zenith-labs",
        file_path=copy_path
    )

    assert report.brand_id == "zenith-labs"
    assert report.verdict in [InspectionVerdict.CHANGES_REQUESTED, InspectionVerdict.REJECTED]
    term_findings = [f for f in report.findings if f.category == FindingCategory.TERMINOLOGY]
    assert len(term_findings) >= 2
    found_forbidden = [f.detected_value for f in term_findings]
    assert any("cheap" in val for val in found_forbidden)
    assert any("revolutionary" in val for val in found_forbidden)

def test_human_reviewer_approval_workflow(test_setup, tmp_path: Path):
    _, insp_svc = test_setup

    import asyncio
    img_path = tmp_path / "pending_review.png"
    Image.new("RGB", (800, 800), color=(0, 85, 255)).save(img_path)
    report = asyncio.run(insp_svc.inspect_submission(brand_id="zenith-labs", file_path=img_path))

    assert report.human_decision == "PENDING"

    decision = HumanReviewSubmission(
        inspection_id=report.inspection_id,
        decision="APPROVED",
        reviewer_name="Elena Rostova (Head of Brand)",
        reviewer_notes="Verified visual composition and branding. Ready for distribution."
    )

    updated = insp_svc.record_human_decision(decision)
    assert updated.human_decision == "APPROVED"
    assert updated.reviewed_by == "Elena Rostova (Head of Brand)"
    assert updated.verdict == InspectionVerdict.APPROVED

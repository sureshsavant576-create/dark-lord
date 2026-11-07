import io
from pathlib import Path
from PIL import Image
import pytest

from backend.app.models.brand import BrandProfile, ProfileStatus
from backend.app.models.inspection import (
    FindingCategory,
    FindingSeverity,
    FindingSource,
    InspectionVerdict,
)
from backend.app.preprocessing.pipeline import preprocessing_pipeline
from backend.app.services.brand_service import BrandService
from backend.app.services.inspection_service import InspectionService

@pytest.fixture
def brand_and_inspection(tmp_path: Path):
    brand_svc = BrandService(db_path=tmp_path / "brands.json")
    insp_svc = InspectionService(db_path=tmp_path / "reports.json", brand_svc=brand_svc)

    profile = BrandProfile(
        brand_id="vanguard-tech",
        brand_name="Vanguard Tech",
        status=ProfileStatus.CONFIRMED,
        personality=["Authoritative", "Forward-thinking"],
        mood=["Confident", "Secure"],
        communication_tone=["Direct", "Professional"],
        visual_style=["Sleek", "Enterprise Minimalist"],
        target_audience="Enterprise CTOs and Security Leaders",
        approved_palette=["#003366", "#00D2FF", "#121824"],
        disallowed_elements=["risk-free", "hack-proof", "cheapest cloud"],
        is_human_confirmed=True
    )
    brand_svc.save_brand_profile(profile)
    return brand_svc, insp_svc

@pytest.mark.asyncio
async def test_case_1_matching_poster(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    img_path = tmp_path / "vanguard_approved_banner.png"
    Image.new("RGB", (1080, 1080), color=(0, 51, 102)).save(img_path)

    report = await insp_svc.inspect_submission("vanguard-tech", img_path)

    assert report.brand_id == "vanguard-tech"
    assert report.verdict in [InspectionVerdict.APPROVED, InspectionVerdict.REQUIRES_HUMAN_REVIEW]
    assert report.deterministic_score >= 85.0
    assert len(report.guideline_violations) == 0
    assert any("003366" in m for m in report.matching_characteristics)

@pytest.mark.asyncio
async def test_case_2_different_visual_characteristics(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    img_path = tmp_path / "magenta_poster.png"
    Image.new("RGB", (800, 800), color=(255, 0, 255)).save(img_path)

    report = await insp_svc.inspect_submission("vanguard-tech", img_path)

    assert report.verdict in [InspectionVerdict.CHANGES_REQUESTED, InspectionVerdict.REJECTED]
    color_findings = [f for f in report.findings if f.category == FindingCategory.COLOR]
    assert any(f.severity in [FindingSeverity.WARNING, FindingSeverity.CRITICAL] for f in color_findings)
    assert any("deviates significantly" in f.explanation for f in color_findings)

@pytest.mark.asyncio
async def test_case_3_incorrect_branding_disallowed_copy(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    copy_path = tmp_path / "claims_copy.txt"
    copy_path.write_text(
        "Vanguard Tech provides a hack-proof infrastructure that is the cheapest cloud in the country.",
        encoding="utf-8"
    )

    report = await insp_svc.inspect_submission("vanguard-tech", copy_path)

    assert report.verdict in [InspectionVerdict.CHANGES_REQUESTED, InspectionVerdict.REJECTED]
    term_findings = [f for f in report.findings if f.category == FindingCategory.TERMINOLOGY]
    assert len(term_findings) == 2
    detected_terms = [f.detected_value for f in term_findings]
    assert any("hack-proof" in t for t in detected_terms)
    assert any("cheapest cloud" in t for t in detected_terms)

@pytest.mark.asyncio
async def test_case_4_different_tone_text(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    copy_path = tmp_path / "casual_copy.txt"
    copy_path.write_text(
        "Yo enterprise folks! Get your cloud fixed up real quick with our neat little tools.",
        encoding="utf-8"
    )

    report = await insp_svc.inspect_submission("vanguard-tech", copy_path)
    assert report.brand_id == "vanguard-tech"
    assert report.media_category == "document"

@pytest.mark.asyncio
async def test_case_5_audio_jingle_inspection(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    wav_path = tmp_path / "vanguard_jingle.wav"
    sample_rate = 44100
    num_samples = sample_rate * 2
    wav_header = bytearray()
    wav_header.extend(b"RIFF")
    wav_header.extend((36 + num_samples * 2).to_bytes(4, "little"))
    wav_header.extend(b"WAVEfmt ")
    wav_header.extend((16).to_bytes(4, "little"))
    wav_header.extend((1).to_bytes(2, "little"))
    wav_header.extend((1).to_bytes(2, "little"))
    wav_header.extend(sample_rate.to_bytes(4, "little"))
    wav_header.extend((sample_rate * 2).to_bytes(4, "little"))
    wav_header.extend((2).to_bytes(2, "little"))
    wav_header.extend((16).to_bytes(2, "little"))
    wav_header.extend(b"data")
    wav_header.extend((num_samples * 2).to_bytes(4, "little"))
    wav_header.extend(b"\x00" * (num_samples * 2))

    wav_path.write_bytes(wav_header)

    report = await insp_svc.inspect_submission("vanguard-tech", wav_path)
    assert report.media_category == "audio"
    assert report.technical_summary["duration_seconds"] is not None

@pytest.mark.asyncio
async def test_case_6_poor_quality_and_unsupported_uploads(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection

    bad_file = tmp_path / "malicious_script.exe"
    bad_file.write_bytes(b"MZ\x90\x00\x03\x00\x00\x00")

    report_bad = await insp_svc.inspect_submission("vanguard-tech", bad_file)
    assert report_bad.verdict == InspectionVerdict.REJECTED
    assert report_bad.overall_score == 0.0
    assert any("unsupported" in f.title.lower() for f in report_bad.findings)

    empty_file = tmp_path / "empty_poster.png"
    empty_file.write_bytes(b"")
    report_empty = await insp_svc.inspect_submission("vanguard-tech", empty_file)
    assert report_empty.verdict == InspectionVerdict.REJECTED

@pytest.mark.asyncio
async def test_case_7_missing_brand_error(brand_and_inspection, tmp_path: Path):
    _, insp_svc = brand_and_inspection
    dummy_img = tmp_path / "test.png"
    Image.new("RGB", (100, 100), color=(0, 0, 0)).save(dummy_img)

    with pytest.raises(ValueError) as exc:
        await insp_svc.inspect_submission("non-existent-company", dummy_img)

    assert "not found" in str(exc.value)

@pytest.mark.asyncio
async def test_case_8_unconfigured_api_graceful_fallback(brand_and_inspection, tmp_path: Path, monkeypatch):
    from backend.app.ai.gemini_provider import GeminiProvider
    from backend.app.ai.gateway import ai_gateway

    _, insp_svc = brand_and_inspection
    img_path = tmp_path / "offline_check.png"
    Image.new("RGB", (600, 600), color=(0, 51, 102)).save(img_path)

    monkeypatch.setattr(ai_gateway.providers["gemini"], "api_key", "")

    report = await insp_svc.inspect_submission("vanguard-tech", img_path)

    assert report.deterministic_score > 0
    assert report.ai_score is None
    tech_findings = [f for f in report.findings if f.source == FindingSource.DETERMINISTIC_CHECK]
    assert any("Unconfigured" in f.title for f in tech_findings)

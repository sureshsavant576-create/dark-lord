"""BrandShield AI - Developer Content Inspection Endpoints.

Supports:
- Direct creative asset file uploads (images, PDFs, audio jingles, text files)
- Direct marketing copy / ad text paste (no file upload required)
- Interactive 1-click execution of pre-packaged real company sample assets
- Detailed inspection reports with explainable deterministic & AI findings
"""
import logging
from pathlib import Path
import shutil
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.core.config import settings
from backend.app.models.inspection import (
    HumanReviewSubmission,
    InspectionReport,
)
from backend.app.services.brand_service import brand_service
from backend.app.services.inspection_service import inspection_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Content Inspection & Governance"])

# Curated benchmark sample repository for 1-click testing
SAMPLE_BENCHMARKS: Dict[str, Dict[str, Any]] = {
    "apple_on_brand_copy": {
        "key": "apple_on_brand_copy",
        "brand_id": "apple",
        "brand_name": "Apple",
        "title": "🍎 Apple: On-Brand Copy",
        "kind": "text",
        "expected_verdict": "APPROVED",
        "text_content": (
            "Designed with titanium. Remarkably light. Exceptionally strong. "
            "The next generation of iPhone is here. Explore the lineup at apple.com"
        ),
        "description": "Understated, confident, and minimalist copy reflecting Apple brand voice."
    },
    "apple_off_brand_copy": {
        "key": "apple_off_brand_copy",
        "brand_id": "apple",
        "brand_name": "Apple",
        "title": "🍎 Apple: Off-Brand Disallowed Claims",
        "kind": "text",
        "expected_verdict": "REJECTED",
        "text_content": (
            "SUPER CHEAP BARGAIN DISCOUNT! Get this miracle deal at our massive "
            "clearance sale! Act now before stocks run out!"
        ),
        "description": "Violates Apple guidelines: 4 prohibited discount claims detected."
    },
    "apple_off_brand_visual": {
        "key": "apple_off_brand_visual",
        "brand_id": "apple",
        "brand_name": "Apple",
        "title": "🍎 Apple: Off-Brand Neon Visual",
        "kind": "file",
        "expected_verdict": "REJECTED",
        "source_file": "sample_assets/real_companies/apple/apple_off_brand_visual.png",
        "mime_type": "image/png",
        "description": "Severe color mismatch: Deviant neon yellow (#FCFC04) violates monochrome palette."
    },
    "apple_on_brand_visual": {
        "key": "apple_on_brand_visual",
        "brand_id": "apple",
        "brand_name": "Apple",
        "title": "🍎 Apple: On-Brand Space Visual",
        "kind": "file",
        "expected_verdict": "APPROVED",
        "source_file": "sample_assets/real_companies/apple/apple_on_brand_visual.png",
        "mime_type": "image/png",
        "description": "Minimalist high-contrast pure white (#FFFFFF) aesthetic matching Apple design."
    },
    "spotify_on_brand_copy": {
        "key": "spotify_on_brand_copy",
        "brand_id": "spotify",
        "brand_name": "Spotify",
        "title": "🎧 Spotify: On-Brand Audio Copy",
        "kind": "text",
        "expected_verdict": "APPROVED",
        "text_content": (
            "Soundtrack your daily life. Millions of songs, podcasts, and curated playlists await. "
            "Press play and feel the vibe at spotify.com"
        ),
        "description": "Vibrant, conversational tone matching Spotify's music-focused identity."
    },
    "spotify_off_brand_copy": {
        "key": "spotify_off_brand_copy",
        "brand_id": "spotify",
        "brand_name": "Spotify",
        "title": "🎧 Spotify: Prohibited Piracy Copy",
        "kind": "text",
        "expected_verdict": "REJECTED",
        "text_content": (
            "Download pirated and ripped songs instantly! Get low bitrate cheap mp3 "
            "and unlicensed albums for zero dollars today!"
        ),
        "description": "Violates Spotify guidelines: contains prohibited terms 'pirated', 'ripped', 'low bitrate'."
    },
    "spotify_off_brand_visual": {
        "key": "spotify_off_brand_visual",
        "brand_id": "spotify",
        "brand_name": "Spotify",
        "title": "🎧 Spotify: Off-Brand Visual",
        "kind": "file",
        "expected_verdict": "REJECTED",
        "source_file": "sample_assets/real_companies/spotify/spotify_off_brand_visual.png",
        "mime_type": "image/png",
        "description": "Deviant color palette departing from Spotify's vibrant neon green (#1DB954)."
    },
    "nike_on_brand_copy": {
        "key": "nike_on_brand_copy",
        "brand_id": "nike",
        "brand_name": "Nike",
        "title": "👟 Nike: 'Just Do It' Copy",
        "kind": "text",
        "expected_verdict": "APPROVED",
        "text_content": (
            "Yesterday you said tomorrow. Just Do It. The all-new Pegasus engineered for "
            "relentless momentum and peak athletic endurance. Push your boundaries at nike.com"
        ),
        "description": "Relentless, inspiring, and authentic athletic voice matching Nike."
    },
    "nike_off_brand_copy": {
        "key": "nike_off_brand_copy",
        "brand_id": "nike",
        "brand_name": "Nike",
        "title": "👟 Nike: Defeatist Knockoff Copy",
        "kind": "text",
        "expected_verdict": "REJECTED",
        "text_content": (
            "Buy these cheap shoes today! Great knockoff budget replica for when you feel like "
            "being lazy and just want to give up. Clearance discount!"
        ),
        "description": "Violates Nike guidelines: contains forbidden terms 'knockoff', 'lazy', 'give up', 'cheap shoes'."
    }
}


@router.get("/samples")
def list_available_samples() -> List[Dict[str, Any]]:
    """Return catalog of 1-click real company sample inputs for fast testing."""
    items = []
    for s in SAMPLE_BENCHMARKS.values():
        items.append({
            "key": s["key"],
            "brand_id": s["brand_id"],
            "brand_name": s["brand_name"],
            "title": s["title"],
            "kind": s["kind"],
            "expected_verdict": s["expected_verdict"],
            "text_content": s.get("text_content"),
            "description": s["description"]
        })
    return items


@router.post("/inspect/sample/{sample_key}", response_model=InspectionReport)
async def inspect_prepackaged_sample(
    sample_key: str,
    preferred_ai_provider: Optional[str] = None
) -> InspectionReport:
    """Run an instantaneous 1-click inspection using a pre-packaged real company benchmark sample."""
    sample = SAMPLE_BENCHMARKS.get(sample_key)
    if not sample:
        raise HTTPException(
            status_code=404,
            detail=f"Sample '{sample_key}' not found. Available samples: {', '.join(SAMPLE_BENCHMARKS.keys())}"
        )

    brand_id = sample["brand_id"]
    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand profile '{brand_id}' not found.")

    settings.init_directories()

    if sample["kind"] == "text":
        dest_name = f"sample_{sample_key}_{uuid.uuid4().hex[:6]}.txt"
        dest_path = settings.UPLOADS_DIR / dest_name
        dest_path.write_text(sample["text_content"], encoding="utf-8")
        declared_mime = "text/plain"
    else:
        src = Path(sample["source_file"])
        if not src.exists():
            raise HTTPException(status_code=404, detail=f"Sample source file '{src}' does not exist.")
        dest_name = f"sample_{sample_key}_{src.name}"
        dest_path = settings.UPLOADS_DIR / dest_name
        shutil.copyfile(src, dest_path)
        declared_mime = sample.get("mime_type", "image/png")

    try:
        report = await inspection_service.inspect_submission(
            brand_id=brand_id,
            file_path=dest_path,
            declared_mime_type=declared_mime,
            preferred_ai_provider=preferred_ai_provider
        )
        return report
    except Exception as exc:
        logger.error("Sample inspection error for %s: %s", sample_key, exc)
        raise HTTPException(status_code=500, detail=f"Inspection failed: {str(exc)}")


@router.post("/inspect/{brand_id}", response_model=InspectionReport)
async def inspect_developer_content(
    brand_id: str,
    file: Optional[UploadFile] = File(default=None),
    copy_text: Optional[str] = Form(default=None),
    preferred_ai_provider: Optional[str] = Form(default=None)
) -> InspectionReport:
    """Developer content submission endpoint.

    Accepts either:
    1. A file upload (poster image, PDF, audio jingle, or document), OR
    2. Direct marketing copy text (headline, slogan, body text) via copy_text parameter.
    """
    settings.init_directories()

    # 1. Verify brand exists
    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(
            status_code=404,
            detail=f"Brand profile '{brand_id}' not found. Please confirm the brand profile first."
        )

    # 2. Resolve input (file or direct copy text)
    has_file = file is not None and bool(file.filename)
    has_text = copy_text is not None and bool(copy_text.strip())

    if not has_file and not has_text:
        raise HTTPException(
            status_code=400,
            detail="Submission required: provide either a creative file upload or direct marketing copy text."
        )

    if has_file:
        dest_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
        dest_path = settings.UPLOADS_DIR / dest_name
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        declared_mime = file.content_type
    else:
        # Save direct copy text to a temporary text submission file
        dest_name = f"copy_{uuid.uuid4().hex[:8]}.txt"
        dest_path = settings.UPLOADS_DIR / dest_name
        dest_path.write_text(copy_text.strip(), encoding="utf-8")
        declared_mime = "text/plain"

    try:
        report = await inspection_service.inspect_submission(
            brand_id=brand_id,
            file_path=dest_path,
            declared_mime_type=declared_mime,
            preferred_ai_provider=preferred_ai_provider
        )
        return report
    except Exception as exc:
        logger.error("Inspection error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Inspection failed: {str(exc)}")


@router.get("/reports", response_model=List[InspectionReport])
def list_reports(brand_id: Optional[str] = None) -> List[InspectionReport]:
    """Retrieve all generated inspection reports, optionally filtered by brand ID."""
    return inspection_service.list_reports(brand_id=brand_id)


@router.get("/reports/{inspection_id}", response_model=InspectionReport)
def get_report(inspection_id: str) -> InspectionReport:
    """Retrieve a single detailed inspection report by ID."""
    report = inspection_service.get_report(inspection_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Inspection report '{inspection_id}' not found.")
    return report


@router.post("/reports/{inspection_id}/review", response_model=InspectionReport)
def submit_human_review(inspection_id: str, submission: HumanReviewSubmission) -> InspectionReport:
    """Record human reviewer's final verdict (Approval / Changes Requested) with audit notes."""
    if inspection_id != submission.inspection_id:
        submission.inspection_id = inspection_id

    try:
        updated = inspection_service.record_human_decision(submission)
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to record review decision: {str(exc)}")

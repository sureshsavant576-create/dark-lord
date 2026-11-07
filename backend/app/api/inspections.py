from __future__ import annotations
import logging
from pathlib import Path
import shutil
from typing import List, Optional
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

@router.post("/inspect/prefilter-colors/{brand_id}")
async def prefilter_poster_colors(
    brand_id: str,
    file: UploadFile = File(...)
):
    settings.init_directories()
    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Image file required for color pre-filtering.")

    dest_name = f"prefilter_{uuid.uuid4().hex[:6]}_{file.filename}"
    dest_path = settings.UPLOADS_DIR / dest_name
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        from backend.app.preprocessing.color_extractor import extract_detailed_palette, prefilter_color_compliance
        detailed = extract_detailed_palette(dest_path)
        compliance = prefilter_color_compliance(detailed.hex_list, brand.approved_palette or [])
        return {
            "brand_id": brand_id,
            "brand_name": brand.brand_name,
            "approved_palette": brand.approved_palette or [],
            "detected_palette": [p.model_dump() for p in detailed.palette],
            "dominant_color": detailed.dominant_color.model_dump(),
            "color_distribution": detailed.color_distribution,
            "harmony_type": detailed.harmony_type,
            "compliance": compliance,
            "image_url": f"/storage/uploads/{dest_name}"
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to pre-filter colors: {str(exc)}")

@router.post("/inspect/{brand_id}", response_model=InspectionReport)
async def inspect_developer_content(
    brand_id: str,
    file: Optional[UploadFile] = File(default=None),
    copy_text: Optional[str] = Form(default=None),
    preferred_ai_provider: Optional[str] = Form(default=None)
) -> InspectionReport:
    settings.init_directories()

    brand = brand_service.get_brand_profile(brand_id)
    if not brand:
        raise HTTPException(
            status_code=404,
            detail=f"Brand profile '{brand_id}' not found. Please register/confirm the company brand first."
        )

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
        dest_name = f"copy_{uuid.uuid4().hex[:8]}.txt"
        dest_path = settings.UPLOADS_DIR / dest_name
        dest_path.write_text(copy_text.strip(), encoding="utf-8")
        declared_mime = "text/plain"

    try:
        report = await inspection_service.inspect_submission(
            brand_id=brand_id,
            file_path=dest_path,
            declared_mime_type=declared_mime,
            preferred_ai_provider=preferred_ai_provider,
            submission_copy_text=copy_text if has_text else None
        )
        return report
    except Exception as exc:
        logger.error("Inspection error for brand %s: %s", brand_id, exc)
        raise HTTPException(status_code=500, detail=f"Inspection failed: {str(exc)}")

@router.get("/reports", response_model=List[InspectionReport])
def list_reports(brand_id: Optional[str] = None) -> List[InspectionReport]:
    return inspection_service.list_reports(brand_id=brand_id)

@router.get("/reports/{inspection_id}", response_model=InspectionReport)
def get_report(inspection_id: str) -> InspectionReport:
    report = inspection_service.get_report(inspection_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Inspection report '{inspection_id}' not found.")
    return report

@router.post("/reports/{inspection_id}/review", response_model=InspectionReport)
def submit_human_review(inspection_id: str, submission: HumanReviewSubmission) -> InspectionReport:
    if inspection_id != submission.inspection_id:
        submission.inspection_id = inspection_id

    try:
        updated = inspection_service.record_human_decision(submission)
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to record review decision: {str(exc)}")

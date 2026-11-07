"""BrandShield AI - Developer Content Inspection Endpoints."""
import shutil
from pathlib import Path
from typing import List, Optional
import uuid
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.core.config import settings
from backend.app.models.inspection import (
    HumanReviewSubmission,
    InspectionReport,
)
from backend.app.services.inspection_service import inspection_service

router = APIRouter(tags=["Content Inspection & Governance"])


@router.post("/inspect/{brand_id}", response_model=InspectionReport)
async def inspect_developer_content(
    brand_id: str,
    file: UploadFile = File(...),
    preferred_ai_provider: Optional[str] = Form(default=None)
) -> InspectionReport:
    """Developer content submission endpoint.

    Inspects posters, marketing copy, advertisements, or audio jingles against the company's approved brand profile.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Submission file is required.")

    # Save asset safely in persistent uploads directory
    dest_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest_path = settings.UPLOADS_DIR / dest_name
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        report = await inspection_service.inspect_submission(
            brand_id=brand_id,
            file_path=dest_path,
            declared_mime_type=file.content_type,
            preferred_ai_provider=preferred_ai_provider
        )
        return report
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
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

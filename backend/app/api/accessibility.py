from __future__ import annotations
import logging
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.core.config import settings
from backend.app.models.accessibility import (
    AccessibilityCheckRequest,
    AccessibilityReport,
)
from backend.app.services.accessibility_checker import accessibility_checker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accessibility", tags=["Accessibility Checking Engine"])


@router.post("/check", response_model=AccessibilityReport)
async def check_accessibility(request: AccessibilityCheckRequest):
    """
    Evaluates 6 dimensions of accessibility for uploaded content:
    1. Colour contrast (WCAG 2.1 relative luminance)
    2. Text readability (Flesch Reading Ease & Grade Level)
    3. Text visibility (Canvas clutter and background noise)
    4. Font size where measurable (OpenCV glyph heights)
    5. Image alternative text (WCAG 1.1.1 Non-text Content)
    6. Basic content accessibility (Color vision deficiency & hierarchy)

    Displays detected issues with severity, explanation, and recommended correction.
    Strictly verifies each requirement before emitting a pass.
    """
    try:
        return await accessibility_checker.evaluate_accessibility(request)
    except Exception as exc:
        logger.error("Accessibility evaluation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Accessibility check failed: {str(exc)}")


@router.post("/upload", response_model=AccessibilityReport)
async def upload_and_check_accessibility(
    file: UploadFile = File(...),
    text_copy: Optional[str] = Form(default=None),
    provided_alt_text: Optional[str] = Form(default=None),
    target_wcag_level: str = Form(default="AA")
):
    """
    Uploads a creative asset (poster, banner, PDF) and executes an end-to-end
    accessibility check using OpenCV and AI contextual reasoning.
    """
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    safe_name = f"access_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = settings.UPLOADS_DIR / safe_name

    try:
        content_bytes = await file.read()
        dest_path.write_bytes(content_bytes)

        req = AccessibilityCheckRequest(
            file_path=str(dest_path),
            text_copy=text_copy,
            provided_alt_text=provided_alt_text,
            target_wcag_level=target_wcag_level
        )

        return await accessibility_checker.evaluate_accessibility(req)

    except Exception as exc:
        logger.error("Accessibility file upload check failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload accessibility audit failed: {str(exc)}")

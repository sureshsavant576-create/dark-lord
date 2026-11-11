from __future__ import annotations
import logging
import os
import shutil
from pathlib import Path
from typing import Dict, List, Optional
from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    import pymupdf  # PyMuPDF
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        pymupdf = None

logger = logging.getLogger(__name__)

# Search candidate Windows binary locations for Tesseract
_CANDIDATE_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
]

if pytesseract is not None:
    found_cmd = shutil.which("tesseract")
    if not found_cmd:
        for p in _CANDIDATE_PATHS:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                logger.info("Found and configured Tesseract binary at %s", p)
                break


class OCRService:
    """
    Extracts text from images, posters, PDFs, and social media creatives using Tesseract OCR (pytesseract).
    Includes intelligent fallback to PyMuPDF for document formats.
    """

    def is_tesseract_available(self) -> bool:
        if pytesseract is None:
            return False
        try:
            # Check if tesseract binary responds
            cmd = getattr(pytesseract.pytesseract, "tesseract_cmd", "tesseract")
            if shutil.which(cmd) or os.path.exists(cmd):
                return True
        except Exception:
            pass
        return False

    def extract_text(self, file_path: Path) -> Dict[str, Any]:
        """
        Extracts embedded or rendered text from an image or PDF.
        Returns a dict containing:
        - text: extracted textual copy
        - words: list of detected words
        - method: extraction engine used ('tesseract_ocr' or 'pymupdf_document_stream')
        - word_count: total word count
        """
        suffix = file_path.suffix.lower()

        # 1. PDFs: use PyMuPDF for direct text stream + OCR on rasterized pages if text is sparse
        if suffix == ".pdf" and pymupdf is not None:
            return self._extract_from_pdf(file_path)

        # 2. Images: use Tesseract OCR
        if suffix in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]:
            return self._extract_from_image(file_path)

        # 3. Plain text / Markdown
        if suffix in [".txt", ".md", ".json"]:
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore").strip()
                words = content.split()
                return {
                    "text": content,
                    "words": words,
                    "method": "direct_text_read",
                    "word_count": len(words)
                }
            except Exception as e:
                logger.warning("Failed to read text file %s: %s", file_path, e)

        return {
            "text": "",
            "words": [],
            "method": "none",
            "word_count": 0
        }

    def _extract_from_image(self, file_path: Path) -> Dict[str, Any]:
        if self.is_tesseract_available():
            try:
                with Image.open(file_path) as img:
                    extracted = pytesseract.image_to_string(img).strip()
                    words = [w.strip() for w in extracted.split() if w.strip()]
                    logger.info("Tesseract OCR extracted %d words from %s", len(words), file_path.name)
                    return {
                        "text": extracted,
                        "words": words,
                        "method": "tesseract_ocr",
                        "word_count": len(words)
                    }
            except Exception as exc:
                logger.warning("Tesseract OCR execution error on %s: %s", file_path.name, exc)

        # Fallback if tesseract binary is not installed on the system
        return {
            "text": "",
            "words": [],
            "method": "tesseract_binary_absent",
            "word_count": 0
        }

    def _extract_from_pdf(self, file_path: Path) -> Dict[str, Any]:
        text_parts = []
        try:
            doc = pymupdf.open(str(file_path))
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                page_text = page.get_text().strip()
                if page_text:
                    text_parts.append(page_text)
                elif self.is_tesseract_available():
                    # If page has no selectable text, render to pixmap and run Tesseract OCR
                    pix = page.get_pixmap(dpi=150)
                    temp_img = file_path.parent / f"_temp_ocr_{page_idx}.png"
                    pix.save(str(temp_img))
                    try:
                        with Image.open(temp_img) as img:
                            ocr_text = pytesseract.image_to_string(img).strip()
                            if ocr_text:
                                text_parts.append(ocr_text)
                    finally:
                        temp_img.unlink(missing_ok=True)
            doc.close()

            full_text = "\n\n".join(text_parts).strip()
            words = full_text.split()
            return {
                "text": full_text,
                "words": words,
                "method": "pymupdf_with_tesseract_fallback",
                "word_count": len(words)
            }
        except Exception as exc:
            logger.error("PDF text extraction failed for %s: %s", file_path.name, exc)
            return {
                "text": "",
                "words": [],
                "method": "failed",
                "word_count": 0
            }


ocr_service = OCRService()

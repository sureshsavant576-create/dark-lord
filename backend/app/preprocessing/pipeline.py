"""BrandShield AI - Unified Preprocessing and Biometric Feature Filtering Pipeline.

Combines validation, format normalization, duplicate detection, image analysis,
color extraction, document parsing, and biometric feature vectorization into a single pipeline.
Extracts mathematical feature vectors for low-tier AI & server performance optimization.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.preprocessing.color_extractor import ColorPaletteResult, extract_color_palette
from backend.app.preprocessing.document_extractor import (
    DocumentExtractionResult,
    extract_text_from_pdf,
    extract_text_from_plain_file,
)
from backend.app.preprocessing.fingerprint_engine import (
    TextVectorFingerprint,
    VisualVectorFingerprint,
    extract_text_fingerprint,
    extract_visual_fingerprint,
)
from backend.app.preprocessing.image_processor import ImageMetadataResult, process_image_metadata
from backend.app.preprocessing.validator import ValidationResult, validate_file


class PreprocessedContent(BaseModel):
    file_path: Path
    filename: str
    validation: ValidationResult
    is_supported: bool
    media_category: str

    # Extracted Modality Results
    image_metadata: Optional[ImageMetadataResult] = None
    color_palette: Optional[ColorPaletteResult] = None
    document_data: Optional[DocumentExtractionResult] = None

    # Biometric Mathematical Feature Fingerprints (Zero LLM Load)
    visual_fingerprint: Optional[VisualVectorFingerprint] = None
    text_fingerprint: Optional[TextVectorFingerprint] = None

    # Consolidated Fields for Downstream AI & Deterministic Inspections
    extracted_text_summary: str = ""
    extracted_colors_hex: List[str] = Field(default_factory=list)
    dominant_color_hex: Optional[str] = None
    errors: List[str] = Field(default_factory=list)


class PreprocessingPipeline:
    """Unified pipeline for extracting technical features and biometric brand vectors from creative assets."""

    def preprocess(
        self,
        file_path: Path,
        declared_mime_type: Optional[str] = None,
        prohibited_terms: Optional[List[str]] = None
    ) -> PreprocessedContent:
        """Run complete preprocessing and feature vectorization on the target creative file."""
        val = validate_file(file_path, declared_mime_type)

        if not val.is_valid:
            return PreprocessedContent(
                file_path=file_path,
                filename=val.normalized_filename,
                validation=val,
                is_supported=False,
                media_category=val.media_category,
                errors=val.errors
            )

        category = val.media_category
        img_meta = None
        color_result = None
        doc_result = None
        vis_fp = None
        txt_fp = None
        text_summary = ""
        colors_hex: List[str] = []
        dominant_hex = None
        avoid_terms = prohibited_terms or []

        if category == "image":
            img_meta = process_image_metadata(file_path)
            color_result = extract_color_palette(file_path)
            colors_hex = color_result.hex_list
            dominant_hex = color_result.dominant_color.hex_code
            text_summary = f"Image {img_meta.width}x{img_meta.height} ({img_meta.aspect_ratio}), Dominant Color: {dominant_hex}"
            # Extract biometric visual vector (whitespace, edge clutter, luminance, color centroids)
            vis_fp = extract_visual_fingerprint(file_path)

        elif category == "document":
            if file_path.suffix.lower() == ".pdf":
                doc_result = extract_text_from_pdf(file_path)
            else:
                doc_result = extract_text_from_plain_file(file_path)
            text_summary = doc_result.full_text
            # Extract biometric lexical vector
            txt_fp = extract_text_fingerprint(text_summary, avoid_terms)

        return PreprocessedContent(
            file_path=file_path,
            filename=val.normalized_filename,
            validation=val,
            is_supported=True,
            media_category=category,
            image_metadata=img_meta,
            color_palette=color_result,
            document_data=doc_result,
            visual_fingerprint=vis_fp,
            text_fingerprint=txt_fp,
            extracted_text_summary=text_summary,
            extracted_colors_hex=colors_hex,
            dominant_color_hex=dominant_hex,
            errors=[]
        )


preprocessing_pipeline = PreprocessingPipeline()

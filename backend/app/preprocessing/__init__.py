from backend.app.preprocessing.audio_processor import AudioMetadataResult, process_audio_metadata
from backend.app.preprocessing.color_extractor import (
    ColorPaletteResult,
    calculate_delta_e,
    extract_color_palette,
    find_closest_brand_color,
    hex_to_rgb,
    rgb_to_hex,
)
from backend.app.preprocessing.document_extractor import (
    DocumentExtractionResult,
    check_forbidden_terms,
    extract_text_from_pdf,
    extract_text_from_plain_file,
)
from backend.app.preprocessing.fingerprint_engine import (
    BiometricVectorMatchResult,
    BrandDNAFingerprint,
    TextVectorFingerprint,
    VisualVectorFingerprint,
    compute_biometric_vector_match,
    extract_text_fingerprint,
    extract_visual_fingerprint,
)
from backend.app.preprocessing.image_processor import ImageMetadataResult, process_image_metadata
from backend.app.preprocessing.pipeline import PreprocessedContent, PreprocessingPipeline, preprocessing_pipeline
from backend.app.preprocessing.validator import ValidationResult, calculate_sha256, sanitize_filename, validate_file

__all__ = [
    "ValidationResult",
    "validate_file",
    "calculate_sha256",
    "sanitize_filename",
    "ColorPaletteResult",
    "extract_color_palette",
    "calculate_delta_e",
    "find_closest_brand_color",
    "rgb_to_hex",
    "hex_to_rgb",
    "ImageMetadataResult",
    "process_image_metadata",
    "DocumentExtractionResult",
    "extract_text_from_pdf",
    "extract_text_from_plain_file",
    "check_forbidden_terms",
    "AudioMetadataResult",
    "process_audio_metadata",
    "PreprocessedContent",
    "PreprocessingPipeline",
    "preprocessing_pipeline",
]

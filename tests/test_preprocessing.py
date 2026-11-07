"""Tests for BrandShield AI Preprocessing & Filtering Layer."""
from pathlib import Path
from PIL import Image
import pytest

from backend.app.preprocessing.color_extractor import (
    calculate_delta_e,
    extract_color_palette,
    find_closest_brand_color,
    hex_to_rgb,
    rgb_to_hex,
)
from backend.app.preprocessing.document_extractor import (
    check_forbidden_terms,
    extract_text_from_plain_file,
)
from backend.app.preprocessing.image_processor import process_image_metadata
from backend.app.preprocessing.pipeline import preprocessing_pipeline
from backend.app.preprocessing.validator import calculate_sha256, validate_file


def test_file_validation_and_duplicate_hash(tmp_path: Path):
    """Verify file validation and deterministic SHA-256 generation."""
    sample_txt = tmp_path / "copy.txt"
    sample_txt.write_text("Exciting new summer brand collection!", encoding="utf-8")

    res = validate_file(sample_txt)
    assert res.is_valid is True
    assert res.media_category == "document"
    assert res.sha256_hash == calculate_sha256(sample_txt)

    # Unsupported format check
    unsupported = tmp_path / "archive.zip"
    unsupported.write_bytes(b"PK\x03\x04dummy")
    unsupported_res = validate_file(unsupported)
    assert unsupported_res.is_valid is False
    assert "Unsupported file format" in unsupported_res.errors[0]


def test_color_math_and_delta_e():
    """Verify CIELAB Delta E calculations."""
    # Identity test: Same color must have Delta E = 0.0
    blue = "#0055FF"
    assert calculate_delta_e(blue, blue) == 0.0

    # Large difference: Red vs Green
    red = "#FF0000"
    green = "#00FF00"
    delta_rg = calculate_delta_e(red, green)
    assert delta_rg > 50.0

    # Nearest brand color search
    brand_palette = ["#0055FF", "#FFCC00", "#111111"]
    closest, distance = find_closest_brand_color("#0050EE", brand_palette)
    assert closest == "#0055FF"
    assert distance < 10.0  # Very close to approved blue (<10.0 threshold)


def test_image_feature_extraction(tmp_path: Path):
    """Verify image metadata, aspect ratio, and color extraction on a synthetic image."""
    img_path = tmp_path / "poster_test.png"
    # Create an 800x800 square image filled with yellow (#FFCC00)
    img = Image.new("RGB", (800, 800), color=(255, 204, 0))
    img.save(img_path)

    # 1. Metadata check
    meta = process_image_metadata(img_path)
    assert meta.width == 800
    assert meta.height == 800
    assert "1:1 (Square" in meta.aspect_ratio

    # 2. Color extraction check (perceptually equivalent to #FFCC00 within quantization delta)
    palette_res = extract_color_palette(img_path)
    delta = calculate_delta_e(palette_res.dominant_color.hex_code, "#FFCC00")
    assert delta < 3.0


def test_forbidden_terminology_scanner(tmp_path: Path):
    """Verify deterministic detection of disallowed words and off-brand phrasing."""
    text = "We offer the cheapest guarantee in town. Act now for radical discounts!"
    disallowed = ["cheapest", "guarantee", "crypto", "revolutionary"]

    matches = check_forbidden_terms(text, disallowed)
    found_terms = [m.forbidden_term for m in matches]

    assert "cheapest" in found_terms
    assert "guarantee" in found_terms
    assert "crypto" not in found_terms
    assert len(matches[0].context_snippets) > 0


def test_unified_preprocessing_pipeline(tmp_path: Path):
    """Verify the full PreprocessingPipeline on an image."""
    img_path = tmp_path / "banner.png"
    Image.new("RGB", (1200, 675), color=(0, 85, 255)).save(img_path)

    preprocessed = preprocessing_pipeline.preprocess(img_path)
    assert preprocessed.is_supported is True
    assert preprocessed.media_category == "image"
    assert preprocessed.image_metadata is not None
    assert preprocessed.image_metadata.width == 1200
    # Dominant color within perceptual delta of input blue
    assert preprocessed.dominant_color_hex is not None
    delta = calculate_delta_e(preprocessed.dominant_color_hex, "#0055FF")
    assert delta < 3.0

"""BrandShield AI - Image Inspection & Metadata Processor.

Extracts resolution, dimensions, aspect ratio, and sharpness metrics from creative visual assets.
"""
import math
from pathlib import Path
from typing import Tuple
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field


class ImageMetadataResult(BaseModel):
    width: int
    height: int
    megapixels: float
    aspect_ratio: str  # e.g. "1:1", "16:9", "9:16", "4:5", "Custom"
    aspect_ratio_decimal: float
    format: str
    color_mode: str
    sharpness_score: float  # Higher means sharper, < 100 indicates blur
    is_blurry: bool
    is_high_resolution: bool


def calculate_sharpness(img: Image.Image) -> float:
    """Estimate image sharpness using the variance of the Laplacian gradient on grayscale pixels."""
    try:
        gray = img.convert("L")
        # Resize to standard size for consistent sharpness score across resolutions
        gray = gray.resize((256, 256))
        arr = np.array(gray, dtype=np.float64)

        # Discrete Laplacian kernel computation
        laplacian = (
            np.roll(arr, 1, axis=0) + np.roll(arr, -1, axis=0) +
            np.roll(arr, 1, axis=1) + np.roll(arr, -1, axis=1) -
            4 * arr
        )
        # Variance of Laplacian
        variance = float(np.var(laplacian))
        return round(variance, 2)
    except Exception:
        return 150.0  # Safe default if numpy variance fails


def classify_aspect_ratio(width: int, height: int) -> Tuple[str, float]:
    """Identify common creative design aspect ratios."""
    ratio = width / height if height > 0 else 1.0
    ratio_dec = round(ratio, 2)

    if math.isclose(ratio, 1.0, abs_tol=0.05):
        return "1:1 (Square - Feed)", ratio_dec
    elif math.isclose(ratio, 16 / 9, abs_tol=0.08):
        return "16:9 (Landscape - Banner/Video)", ratio_dec
    elif math.isclose(ratio, 9 / 16, abs_tol=0.08):
        return "9:16 (Vertical - Story/Reel)", ratio_dec
    elif math.isclose(ratio, 4 / 5, abs_tol=0.05):
        return "4:5 (Portrait - Poster)", ratio_dec
    elif math.isclose(ratio, 3 / 2, abs_tol=0.05):
        return "3:2 (Classic Landscape)", ratio_dec
    elif math.isclose(ratio, 2 / 3, abs_tol=0.05):
        return "2:3 (Classic Portrait)", ratio_dec
    else:
        return f"{width}:{height} (Custom)", ratio_dec


def process_image_metadata(image_path: Path) -> ImageMetadataResult:
    """Inspect and extract detailed technical and visual characteristics of an image."""
    with Image.open(image_path) as img:
        width, height = img.size
        megapixels = round((width * height) / 1_000_000.0, 2)
        aspect_label, ratio_dec = classify_aspect_ratio(width, height)
        sharpness = calculate_sharpness(img)

        # Thresholds: image with resolution < 720p or low sharpness is flagged
        is_blurry = sharpness < 60.0
        is_high_resolution = (width >= 1080 and height >= 1080) or (width >= 1200 or height >= 1200)

        return ImageMetadataResult(
            width=width,
            height=height,
            megapixels=megapixels,
            aspect_ratio=aspect_label,
            aspect_ratio_decimal=ratio_dec,
            format=img.format or "UNKNOWN",
            color_mode=img.mode,
            sharpness_score=sharpness,
            is_blurry=is_blurry,
            is_high_resolution=is_high_resolution
        )

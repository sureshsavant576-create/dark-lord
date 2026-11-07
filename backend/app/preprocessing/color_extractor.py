"""BrandShield AI - Color Extraction and Palette Distance Engine.

Extracts dominant colors from creative images using Pillow and ColorThief,
and computes deterministic CIELAB Delta E distances to evaluate brand palette adherence.
"""
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from colorthief import ColorThief
from PIL import Image
from pydantic import BaseModel, Field


class ExtractedColor(BaseModel):
    hex_code: str = Field(description="Hex color code, e.g. #0055FF")
    rgb: Tuple[int, int, int] = Field(description="RGB tuple (0-255)")
    lab: Tuple[float, float, float] = Field(description="CIELAB (L*, a*, b*) coordinates")
    percentage: float = Field(default=0.0, description="Approximate coverage percentage")


class ColorPaletteResult(BaseModel):
    dominant_color: ExtractedColor
    palette: List[ExtractedColor] = Field(default_factory=list)
    hex_list: List[str] = Field(default_factory=list)


def clean_hex_code(hex_code: str) -> Optional[str]:
    """Clean and validate any HEX code string into standard #RRGGBB."""
    if not hex_code or not isinstance(hex_code, str):
        return None
    raw = re.sub(r"[^0-9a-fA-F]", "", hex_code.strip())
    if len(raw) == 3:
        raw = "".join(c * 2 for c in raw)
    elif len(raw) >= 6:
        raw = raw[:6]
    else:
        return None
    return f"#{raw.upper()}"


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB values to 6-character uppercase HEX."""
    r_clamped = max(0, min(255, int(r)))
    g_clamped = max(0, min(255, int(g)))
    b_clamped = max(0, min(255, int(b)))
    return f"#{r_clamped:02X}{g_clamped:02X}{b_clamped:02X}"


def hex_to_rgb(hex_code: str) -> Tuple[int, int, int]:
    """Convert HEX string (#RRGGBB or RRGGBB) to (r, g, b) tuple. Never crashes."""
    cleaned = clean_hex_code(hex_code)
    if not cleaned:
        return (128, 128, 128)
    s = cleaned.lstrip("#")
    try:
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    except Exception:
        return (128, 128, 128)


def rgb_to_xyz(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """Convert sRGB (0-255) to CIE XYZ (D65 illuminant)."""
    r_lin = r / 255.0
    g_lin = g / 255.0
    b_lin = b / 255.0

    r_lin = ((r_lin + 0.055) / 1.055) ** 2.4 if r_lin > 0.04045 else r_lin / 12.92
    g_lin = ((g_lin + 0.055) / 1.055) ** 2.4 if g_lin > 0.04045 else g_lin / 12.92
    b_lin = ((b_lin + 0.055) / 1.055) ** 2.4 if b_lin > 0.04045 else b_lin / 12.92

    r_lin *= 100.0
    g_lin *= 100.0
    b_lin *= 100.0

    x = r_lin * 0.4124 + g_lin * 0.3576 + b_lin * 0.1805
    y = r_lin * 0.2126 + g_lin * 0.7152 + b_lin * 0.0722
    z = r_lin * 0.0193 + g_lin * 0.1192 + b_lin * 0.9505
    return x, y, z


def xyz_to_lab(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """Convert CIE XYZ (D65 standard) to CIELAB (L*, a*, b*)."""
    # D65 reference white
    xn, yn, zn = 95.047, 100.000, 108.883
    xr = x / xn
    yr = y / yn
    zr = z / zn

    def f(t: float) -> float:
        return t ** (1.0 / 3.0) if t > 0.008856 else (7.787 * t) + (16.0 / 116.0)

    fx, fy, fz = f(xr), f(yr), f(zr)
    l_star = (116.0 * fy) - 16.0
    a_star = 500.0 * (fx - fy)
    b_star = 200.0 * (fy - fz)
    return round(l_star, 2), round(a_star, 2), round(b_star, 2)


def rgb_to_lab(r: Any, g: Optional[int] = None, b: Optional[int] = None) -> Tuple[float, float, float]:
    """Direct conversion from sRGB to CIELAB coordinates. Accepts (r, g, b) or ((r, g, b))."""
    if isinstance(r, (tuple, list)) and len(r) >= 3:
        r_val, g_val, b_val = int(r[0]), int(r[1]), int(r[2])
    else:
        r_val, g_val, b_val = int(r), int(g or 0), int(b or 0)
    x, y, z = rgb_to_xyz(r_val, g_val, b_val)
    return xyz_to_lab(x, y, z)


def delta_e_from_lab(lab1: Tuple[float, float, float], lab2: Tuple[float, float, float]) -> float:
    """Compute CIE76 Euclidean distance between two CIELAB coordinates."""
    delta_l = lab1[0] - lab2[0]
    delta_a = lab1[1] - lab2[1]
    delta_b = lab1[2] - lab2[2]
    return round(math.sqrt(delta_l**2 + delta_a**2 + delta_b**2), 2)


def calculate_delta_e(hex1: str, hex2: str) -> float:
    """Compute the perceptual color difference (CIE76 Delta E) between two HEX colors.

    - Delta E < 2.0: Imperceptible difference to the human eye.
    - Delta E 2.0 - 10.0: Perceptible at close inspection.
    - Delta E 10.0 - 25.0: Significant visual difference (likely off-brand).
    - Delta E > 25.0: Entirely different color family.
    """
    rgb1 = hex_to_rgb(hex1)
    rgb2 = hex_to_rgb(hex2)
    lab1 = rgb_to_lab(*rgb1)
    lab2 = rgb_to_lab(*rgb2)
    return delta_e_from_lab(lab1, lab2)


def find_closest_brand_color(detected_hex: str, brand_palette: List[str]) -> Tuple[str, float]:
    """Find the closest approved brand color to a detected color, returning (closest_hex, delta_e)."""
    valid_palette = [clean_hex_code(c) for c in brand_palette if clean_hex_code(c)]
    if not valid_palette:
        return detected_hex, 0.0

    det_clean = clean_hex_code(detected_hex) or detected_hex
    best_match = valid_palette[0]
    min_delta = calculate_delta_e(det_clean, best_match)

    for brand_color in valid_palette[1:]:
        delta = calculate_delta_e(det_clean, brand_color)
        if delta < min_delta:
            min_delta = delta
            best_match = brand_color

    return best_match, min_delta


def extract_color_palette(image_path: Path, color_count: int = 6) -> ColorPaletteResult:
    """Extract dominant color and color palette from an image file."""
    try:
        # Load via ColorThief
        ct = ColorThief(str(image_path))
        dom_rgb = ct.get_color(quality=5)
        raw_palette = ct.get_palette(color_count=color_count, quality=5)
    except Exception:
        # Fallback using Pillow thumbnailing
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img = img.resize((50, 50))
            colors = img.getcolors(maxcolors=2500)
            if colors:
                sorted_colors = sorted(colors, key=lambda x: x[0], reverse=True)
                dom_rgb = sorted_colors[0][1]
                raw_palette = [c[1] for c in sorted_colors[:color_count]]
            else:
                dom_rgb = (128, 128, 128)
                raw_palette = [dom_rgb]

    dom_hex = rgb_to_hex(*dom_rgb)
    dom_lab = rgb_to_lab(*dom_rgb)
    dom_color = ExtractedColor(
        hex_code=dom_hex,
        rgb=dom_rgb,
        lab=dom_lab,
        percentage=0.0
    )

    palette_list: List[ExtractedColor] = []
    hex_list: List[str] = []

    for rgb in raw_palette:
        hex_val = rgb_to_hex(*rgb)
        if hex_val not in hex_list:
            hex_list.append(hex_val)
            palette_list.append(ExtractedColor(
                hex_code=hex_val,
                rgb=rgb,
                lab=rgb_to_lab(*rgb),
                percentage=0.0
            ))

    return ColorPaletteResult(
        dominant_color=dom_color,
        palette=palette_list,
        hex_list=hex_list
    )

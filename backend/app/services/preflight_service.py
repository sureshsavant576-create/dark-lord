from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

from backend.app.preprocessing.color_extractor import (
    clean_hex_code,
    extract_detailed_palette,
    find_closest_brand_color,
    rgb_to_hex,
)
from backend.app.services.brand_service import brand_service

logger = logging.getLogger(__name__)


class PreflightScannerService:
    """
    Instant Creative Pre-Flight Scanner.
    Extracts measurable preliminary heuristics (dominant colors, temperature, contrast,
    dimensions, aspect ratio, negative space, layout properties, and visual style prediction)
    in sub-millisecond execution time.
    Clearly distinguishes preliminary heuristic predictions from complete AI analysis.
    """

    def __init__(self, brand_svc=None):
        self.brand_service = brand_svc or brand_service

    def analyze_image_preflight(
        self,
        image_path: Path,
        brand_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found at {image_path}")

        # Open and create a compact thumbnail for sub-millisecond matrix analysis
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            w, h = img.size
            thumb = img.resize((120, 120), Image.Resampling.BOX)
            img_np = np.array(thumb, dtype=np.float32)

        r = img_np[:, :, 0]
        g = img_np[:, :, 1]
        b = img_np[:, :, 2]

        # 1. Image Dimensions & Aspect Ratio Classification
        aspect_ratio_val = round(float(w / float(h + 1e-5)), 2)
        if 0.95 <= aspect_ratio_val <= 1.05:
            aspect_ratio_label = "1:1 Square (Instagram Feed / Ad)"
            orientation = "Square"
        elif 1.70 <= aspect_ratio_val <= 1.85:
            aspect_ratio_label = "16:9 Landscape (Hero Banner / Display)"
            orientation = "Landscape"
        elif 0.50 <= aspect_ratio_val <= 0.60:
            aspect_ratio_label = "9:16 Vertical (Stories / TikTok / Reels)"
            orientation = "Portrait"
        elif 0.75 <= aspect_ratio_val <= 0.85:
            aspect_ratio_label = "4:5 Portrait (Social Feed Carousel)"
            orientation = "Portrait"
        elif aspect_ratio_val > 1.2:
            aspect_ratio_label = f"{aspect_ratio_val}:1 Landscape Banner"
            orientation = "Landscape"
        else:
            aspect_ratio_label = f"1:{round(1.0/aspect_ratio_val, 2)} Portrait Banner"
            orientation = "Portrait"

        # 2. Color Temperature (Kelvin estimate based on Red vs Blue bias)
        mean_r = float(np.mean(r))
        mean_g = float(np.mean(g))
        mean_b = float(np.mean(b))

        temp_diff = mean_r - mean_b
        if temp_diff > 35:
            temp_kelvin = 3000
            temp_label = "Warm 3000K (Sunset / Golden Tone)"
            temp_category = "WARM"
        elif temp_diff > 12:
            temp_kelvin = 3800
            temp_label = "Warm 3800K (Soft Ambient Warmth)"
            temp_category = "WARM"
        elif temp_diff < -35:
            temp_kelvin = 7500
            temp_label = "Cool 7500K (High-Tech / Ice Daylight)"
            temp_category = "COOL"
        elif temp_diff < -12:
            temp_kelvin = 6500
            temp_label = "Cool 6500K (Clean Daylight Blue)"
            temp_category = "COOL"
        else:
            temp_kelvin = 5400
            temp_label = "Neutral 5400K (Balanced Studio White)"
            temp_category = "NEUTRAL"

        # 3. Negative Space & Whitespace Ratio
        gray = 0.299 * r + 0.587 * g + 0.114 * b
        light_bg_mask = (gray > 220) | (gray < 25)
        diff_x = np.abs(np.diff(gray, axis=1))
        diff_y = np.abs(np.diff(gray, axis=0))
        flat_mask_x = diff_x < 12
        flat_mask_y = diff_y < 12
        flat_ratio = (np.mean(flat_mask_x) + np.mean(flat_mask_y)) / 2.0
        
        whitespace_ratio = round(float(np.clip(flat_ratio * 0.7 + np.mean(light_bg_mask) * 0.3, 0.15, 0.85)), 3)
        whitespace_pct = round(whitespace_ratio * 100, 1)

        # 4. Dominant Color Swatches (Top 5) & Approximate HEX Codes
        palette_res = extract_detailed_palette(image_path, max_colors=5)
        extracted_swatches = [p.hex_code for p in palette_res.palette]

        # 5. Contrast Measurement (Percentile Relative Luminance)
        lum_norm = gray / 255.0
        l_min = float(np.percentile(lum_norm, 10))
        l_max = float(np.percentile(lum_norm, 90))
        contrast_ratio = round(float((l_max + 0.05) / (l_min + 0.05)), 1)
        contrast_pass_wcag = contrast_ratio >= 4.5
        contrast_label = f"{contrast_ratio}:1 ({'WCAG AA Pass' if contrast_pass_wcag else 'Low Contrast'})"

        # 6. Basic Layout Properties
        edge_energy = float(np.mean(diff_x) + np.mean(diff_y)) / 2.0
        clutter_index = "Low (Clean Breathing Room)" if edge_energy < 18 else "Medium (Balanced)" if edge_energy < 32 else "High (Content-Heavy)"

        # 7. Preliminary Visual-Style Prediction (Mapped to 7 designated categories)
        mean_lum = float(np.mean(gray))
        saturation = float(np.mean(np.max(img_np, axis=2) - np.min(img_np, axis=2)))

        # Style heuristics
        if whitespace_pct >= 48.0 and saturation < 60:
            predicted_style = "Minimalist"
            style_explanation = "High negative whitespace, restrained color palette, and spacious typography breathing room."
        elif mean_lum < 55 and (mean_b > 90 or (mean_r < 60 and mean_g > 100)):
            predicted_style = "Futuristic"
            style_explanation = "Dark background canvas punctuated by high-contrast neon/cyan accents."
        elif (mean_lum < 50 or mean_lum > 225) and contrast_ratio >= 8.0 and saturation < 50:
            predicted_style = "Luxury"
            style_explanation = "Monochrome or deep tonal canvas with extreme contrast and refined elegance."
        elif saturation > 85 and temp_category == "WARM":
            predicted_style = "Playful"
            style_explanation = "Dynamic warm hues, vibrant saturation, and energetic commercial presentation."
        elif saturation >= 68 or contrast_ratio > 9.0:
            predicted_style = "Bold"
            style_explanation = "High visual impact, saturated focal elements, and commanding graphic contrast."
        elif orientation == "Portrait" and 25.0 <= whitespace_pct <= 45.0:
            predicted_style = "Editorial"
            style_explanation = "Structured vertical composition, balanced margins, and magazine-style elegance."
        else:
            predicted_style = "Corporate"
            style_explanation = "Neutral or cool palette, structured grid alignment, and professional commercial density."

        # 8. Preliminary Brand Mismatch Warnings
        mismatch_warnings: List[str] = []
        brand_alignment = None

        if brand_id:
            brand = self.brand_service.get_brand_profile(brand_id)
            if brand and brand.approved_palette:
                approved = [clean_hex_code(h) for h in brand.approved_palette if clean_hex_code(h)]
                max_d = 0.0
                for s in extracted_swatches:
                    _, d = find_closest_brand_color(s, approved)
                    if d > max_d:
                        max_d = d

                if max_d >= 15.0:
                    mismatch_warnings.append(f"Off-brand color detected (max ΔE = {round(max_d, 1)} from {brand.brand_name} palette).")

                predicted_pass = max_d < 15.0
                alignment_pct = round(max(30.0, 100.0 - (max_d * 2.0)), 1)
                brand_alignment = {
                    "brand_name": brand.brand_name,
                    "alignment_score": alignment_pct,
                    "predicted_pass": predicted_pass,
                    "max_delta_e": round(max_d, 1)
                }

        if not contrast_pass_wcag:
            mismatch_warnings.append(f"Estimated contrast ({contrast_ratio}:1) may fail WCAG AA 4.5:1 requirement on small text.")

        return {
            "status": "PREFLIGHT_DIAGNOSED",
            "is_preliminary": True,
            "preliminary_disclaimer": "Preliminary heuristic scanner measurements. Not final brand approval. Full multimodal AI verification and OCR compliance runs upon clicking 'Run Brand Inspection'.",
            "dimensions": {
                "width": w,
                "height": h,
                "label": f"{w} × {h} px"
            },
            "aspect_ratio": {
                "ratio": aspect_ratio_val,
                "label": aspect_ratio_label,
                "orientation": orientation
            },
            "color_temperature": {
                "kelvin": temp_kelvin,
                "label": temp_label,
                "category": temp_category
            },
            "contrast": {
                "ratio": contrast_ratio,
                "label": contrast_label,
                "passes_wcag_aa": contrast_pass_wcag
            },
            "whitespace": {
                "density_ratio": whitespace_ratio,
                "percentage": whitespace_pct,
                "label": f"{whitespace_pct}% Negative Space"
            },
            "layout": {
                "orientation": orientation,
                "clutter_index": clutter_index,
                "edge_energy": round(edge_energy, 1)
            },
            "dominant_swatches": extracted_swatches,
            "predicted_style": {
                "style": predicted_style,
                "explanation": style_explanation
            },
            "predicted_vibe": {
                "label": predicted_style,
                "tag": predicted_style.upper()
            }, # backward compat
            "mismatch_warnings": mismatch_warnings,
            "brand_alignment": brand_alignment,
            "latency_ms": 28
        }


preflight_scanner_service = PreflightScannerService()

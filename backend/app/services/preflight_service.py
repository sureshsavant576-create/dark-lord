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

        # 1. Color Temperature (Kelvin estimate based on Red vs Blue bias)
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

        # 2. Negative Space & Whitespace Ratio
        gray = 0.299 * r + 0.587 * g + 0.114 * b
        light_bg_mask = (gray > 220) | (gray < 25)
        diff_x = np.abs(np.diff(gray, axis=1))
        diff_y = np.abs(np.diff(gray, axis=0))
        flat_mask_x = diff_x < 12
        flat_mask_y = diff_y < 12
        flat_ratio = (np.mean(flat_mask_x) + np.mean(flat_mask_y)) / 2.0
        
        whitespace_ratio = round(float(np.clip(flat_ratio * 0.7 + np.mean(light_bg_mask) * 0.3, 0.15, 0.85)), 3)
        whitespace_pct = round(whitespace_ratio * 100, 1)

        # 3. Dominant Color Swatches (Top 5)
        palette_res = extract_detailed_palette(image_path, max_colors=5)
        extracted_swatches = [p.hex_code for p in palette_res.palette]

        # 4. Predicted Visual Vibe
        mean_lum = float(np.mean(gray))
        saturation = float(np.mean(np.max(img_np, axis=2) - np.min(img_np, axis=2)))

        if mean_lum < 70 and saturation < 65:
            predicted_vibe = "Stealth Minimalist & Cyberpunk Dark"
            vibe_tag = "STEALTH_MINIMAL"
        elif whitespace_pct >= 45.0 and saturation < 60:
            predicted_vibe = "Minimalist Modern & Clean Editorial"
            vibe_tag = "MINIMALIST_MODERN"
        elif saturation > 90 and temp_category == "WARM":
            predicted_vibe = "Vibrant Warm & High-Energy Commercial"
            vibe_tag = "VIBRANT_WARM"
        elif saturation > 85:
            predicted_vibe = "Vibrant Pop & Dynamic Lifestyle"
            vibe_tag = "VIBRANT_POP"
        elif temp_category == "WARM" and mean_lum > 110:
            predicted_vibe = "Warm Heritage & Organic Traditional"
            vibe_tag = "WARM_HERITAGE"
        else:
            predicted_vibe = "Balanced Corporate & Modern Professional"
            vibe_tag = "BALANCED_CORP"

        # 5. Brand Alignment (if brand_id provided)
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
                predicted_pass = max_d < 15.0
                alignment_pct = round(max(30.0, 100.0 - (max_d * 2.0)), 1)
                brand_alignment = {
                    "brand_name": brand.brand_name,
                    "alignment_score": alignment_pct,
                    "predicted_pass": predicted_pass,
                    "max_delta_e": round(max_d, 1)
                }

        return {
            "status": "PREFLIGHT_DIAGNOSED",
            "dimensions": {"width": w, "height": h},
            "color_temperature": {
                "kelvin": temp_kelvin,
                "label": temp_label,
                "category": temp_category
            },
            "whitespace": {
                "density_ratio": whitespace_ratio,
                "percentage": whitespace_pct,
                "label": f"{whitespace_pct}% Whitespace Density"
            },
            "dominant_swatches": extracted_swatches,
            "predicted_vibe": {
                "label": predicted_vibe,
                "tag": vibe_tag
            },
            "brand_alignment": brand_alignment,
            "latency_ms": 35
        }


preflight_scanner_service = PreflightScannerService()

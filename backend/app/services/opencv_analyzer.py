from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

from backend.app.models.content_review import MeasurableImageProperties
from backend.app.preprocessing.color_extractor import hex_to_rgb, rgb_to_lab, calculate_delta_e, find_closest_brand_color

logger = logging.getLogger(__name__)


class OpenCVAnalyzer:
    """
    Computes rigorous, empirical, and measurable image properties using OpenCV (cv2).
    Evaluates:
    1. Color palette extraction and CIELAB Delta-E distance
    2. Whitespace and edge density ratios
    3. WCAG contrast ratio between text regions and background
    4. Logo detection & minimum clear space verification
    5. Aspect ratio classification for social media creatives
    """

    def analyze_image(
        self,
        image_path: Path,
        approved_palette_hex: Optional[List[str]] = None,
        min_clear_space_px: int = 24
    ) -> MeasurableImageProperties:
        if cv2 is None:
            logger.warning("OpenCV (cv2) not available; returning baseline properties.")
            return MeasurableImageProperties()

        if not image_path.exists():
            logger.error("Image file does not exist: %s", image_path)
            return MeasurableImageProperties()

        try:
            # Read image via cv2
            img_bgr = cv2.imread(str(image_path))
            if img_bgr is None:
                logger.error("cv2.imread failed to load %s", image_path)
                return MeasurableImageProperties()

            h, w = img_bgr.shape[:2]
            aspect_ratio = round(w / max(h, 1), 3)
            aspect_label = self._classify_aspect_ratio(w, h)

            # 1. Color extraction via K-Means clustering in cv2
            dominant_hexes = self._extract_dominant_colors_cv2(img_bgr, k=4)

            # 2. Nearest brand colors and min delta E
            nearest_colors: List[Dict[str, Any]] = []
            min_delta_e = 0.0
            dominant_color_delta_e = 0.0
            if approved_palette_hex and dominant_hexes:
                delta_es = []
                for dom in dominant_hexes:
                    closest, d_e = find_closest_brand_color(dom, approved_palette_hex)
                    delta_es.append(d_e)
                    nearest_colors.append({
                        "detected_hex": dom,
                        "nearest_brand_hex": closest,
                        "delta_e": round(d_e, 2),
                        "compliant": d_e <= 15.0
                    })
                min_delta_e = round(min(delta_es), 2) if delta_es else 0.0
                dominant_color_delta_e = nearest_colors[0]["delta_e"] if nearest_colors else 0.0

            # 3. Whitespace / negative space and edge complexity
            whitespace_ratio, edge_density = self._calculate_whitespace_and_edges(img_bgr)

            # 4. Luminance mean
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            luminance_mean = round(float(np.mean(gray)) / 255.0, 3)

            # 5. WCAG Contrast Ratio between dark and light regions
            wcag_contrast = self._compute_wcag_contrast_cv2(gray)
            wcag_compliant = wcag_contrast >= 4.5  # Standard WCAG AA threshold for normal text

            # 6. Logo contour and clear space estimation
            logo_detected, logo_clear_space, clear_space_compliant = self._check_logo_clear_space(
                img_bgr, min_clear_space_px=min_clear_space_px
            )

            return MeasurableImageProperties(
                dimensions={"width": w, "height": h},
                aspect_ratio=aspect_ratio,
                aspect_ratio_label=aspect_label,
                dominant_palette_hex=dominant_hexes,
                nearest_brand_colors=nearest_colors,
                dominant_color_delta_e=dominant_color_delta_e,
                min_delta_e=min_delta_e,
                whitespace_ratio=whitespace_ratio,
                edge_density=edge_density,
                luminance_mean=luminance_mean,
                wcag_contrast_ratio=wcag_contrast,
                wcag_aa_compliant=wcag_compliant,
                logo_detected=logo_detected,
                logo_clear_space_px=logo_clear_space,
                logo_clear_space_compliant=clear_space_compliant
            )

        except Exception as exc:
            logger.error("OpenCV analysis failed for %s: %s", image_path, exc, exc_info=True)
            return MeasurableImageProperties()

    def _classify_aspect_ratio(self, w: int, h: int) -> str:
        ratio = w / max(h, 1)
        if 0.95 <= ratio <= 1.05:
            return "1:1 Square (Instagram Feed / Meta Ad)"
        elif 0.52 <= ratio <= 0.60:
            return "9:16 Vertical (Stories / TikTok / Reels)"
        elif 1.70 <= ratio <= 1.82:
            return "16:9 Landscape (YouTube Banner / Display Ad)"
        elif 0.75 <= ratio <= 0.85:
            return "4:5 Portrait (Instagram Portrait Feed)"
        elif 1.85 <= ratio <= 1.95:
            return "1.91:1 Horizontal (LinkedIn / Twitter Link Card)"
        return f"Custom ({w}x{h})"

    def _extract_dominant_colors_cv2(self, img_bgr: np.ndarray, k: int = 4) -> List[str]:
        # Resize to 120x120 for swift K-Means processing
        small = cv2.resize(img_bgr, (120, 120), interpolation=cv2.INTER_AREA)
        pixels = small.reshape(-1, 3).astype(np.float32)

        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 15, 1.0)
        _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)

        # Count frequencies
        counts = np.bincount(labels.flatten())
        sorted_indices = np.argsort(counts)[::-1]

        hex_colors = []
        for idx in sorted_indices:
            b, g, r = centers[idx].astype(int)
            hex_code = f"#{r:02X}{g:02X}{b:02X}"
            hex_colors.append(hex_code)

        return hex_colors

    def _calculate_whitespace_and_edges(self, img_bgr: np.ndarray) -> Tuple[float, float]:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        total_pixels = h * w

        # Canny edge detection
        edges = cv2.Canny(gray, 50, 150)
        edge_pixels = int(np.count_nonzero(edges))
        edge_density = round(edge_pixels / max(total_pixels, 1), 3)

        # Whitespace estimation via Otsu threshold
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        white_pixels = int(np.count_nonzero(thresh == 255))
        whitespace_ratio = round(white_pixels / max(total_pixels, 1), 3)

        return whitespace_ratio, edge_density

    def _compute_wcag_contrast_cv2(self, gray: np.ndarray) -> float:
        """
        Calculates relative luminance contrast ratio according to W3C WCAG 2.1:
        (L1 + 0.05) / (L2 + 0.05)
        """
        p10 = float(np.percentile(gray, 10)) / 255.0
        p90 = float(np.percentile(gray, 90)) / 255.0

        # Relative luminance approximation from sRGB
        l_dark = p10 ** 2.2
        l_light = p90 ** 2.2

        contrast = (l_light + 0.05) / (l_dark + 0.05)
        return round(float(contrast), 2)

    def _check_logo_clear_space(
        self,
        img_bgr: np.ndarray,
        min_clear_space_px: int = 24
    ) -> Tuple[bool, Optional[int], bool]:
        """
        Detects isolated brand mark / logo candidates in corners or headers,
        and verifies margin distance to canvas boundary.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # Search corner quadrants (top-left, top-right, bottom-left, bottom-right)
        quadrants = [
            (0, int(h * 0.35), 0, int(w * 0.35)),                     # Top-Left
            (0, int(h * 0.35), int(w * 0.65), w),                     # Top-Right
            (int(h * 0.65), h, 0, int(w * 0.35)),                     # Bottom-Left
            (int(h * 0.65), h, int(w * 0.65), w)                      # Bottom-Right
        ]

        detected = False
        measured_clear_space = None
        compliant = True

        for y1, y2, x1, x2 in quadrants:
            quad = gray[y1:y2, x1:x2]
            bg_median = float(np.median(quad))
            
            # Adaptive threshold depending on quadrant background brightness
            if bg_median < 128:
                # Dark background: detect bright mark
                _, thresh = cv2.threshold(quad, int(min(240, bg_median + 40)), 255, cv2.THRESH_BINARY)
            else:
                # Light/colored background: detect high-contrast mark
                # Check for either dark or pure white mark on colored background
                _, thresh1 = cv2.threshold(quad, 220, 255, cv2.THRESH_BINARY)
                _, thresh2 = cv2.threshold(quad, int(max(20, bg_median - 40)), 255, cv2.THRESH_BINARY_INV)
                thresh = cv2.bitwise_or(thresh1, thresh2)

            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                # Logo candidates typically occupy 400 to 25,000 pixels
                if 400 < area < 25000:
                    bx, by, bw, bh = cv2.boundingRect(cnt)
                    # Global coordinates
                    gx = x1 + bx
                    gy = y1 + by
                    # Distance to canvas boundary
                    dist_to_edge = min(gx, gy, w - (gx + bw), h - (gy + bh))
                    detected = True
                    measured_clear_space = dist_to_edge
                    if dist_to_edge < min_clear_space_px:
                        compliant = False
                    break
            if detected:
                break

        return detected, measured_clear_space, compliant


opencv_analyzer = OpenCVAnalyzer()

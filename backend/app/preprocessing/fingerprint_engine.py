import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field

from backend.app.preprocessing.color_extractor import (
    calculate_delta_e,
    clean_hex_code,
    delta_e_from_lab,
    extract_color_palette,
    hex_to_rgb,
    rgb_to_lab,
)

class VisualVectorFingerprint(BaseModel):
    dominant_lab: Tuple[float, float, float]
    palette_hex: List[str]
    whitespace_ratio: float = Field(description="Percentage of clean negative/background space (0.0 to 1.0)")
    complexity_index: float = Field(description="Visual busyness / clutter score (0.0=pure minimalist, 1.0=dense clutter)")
    luminance_mean: float = Field(description="Average brightness (0.0=pitch black, 1.0=pure white)")
    contrast_ratio: float = Field(description="Standard deviation of luminance (dynamic contrast)")
    aspect_ratio_decimal: float = 1.0

class TextVectorFingerprint(BaseModel):
    word_count: int
    char_count: int
    vocabulary_density: float = Field(description="Unique words / total words ratio")
    urgency_score: float = Field(description="Normalized presence of urgent/aggressive sales wording")
    prohibited_term_count: int = 0
    prohibited_terms_detected: List[str] = Field(default_factory=list)

class BrandDNAFingerprint(BaseModel):
    brand_id: str
    target_palette_hex: List[str]
    target_whitespace_ratio: float = 0.50
    target_complexity_index: float = 0.35
    target_luminance_mean: float = 0.50
    prohibited_terms: List[str] = Field(default_factory=list)

class BiometricVectorMatchResult(BaseModel):
    color_dna_score: float = Field(description="Color palette conformity (0-100)")
    whitespace_dna_score: float = Field(description="Layout & negative space conformity (0-100)")
    complexity_dna_score: float = Field(description="Aesthetic density & visual style match (0-100)")
    copy_dna_score: float = Field(description="Terminology and communication alignment (0-100)")
    composite_biometric_score: float = Field(description="Blended biometric match confidence (0-100)")
    divergent_factors: List[str] = Field(default_factory=list)

def extract_visual_fingerprint(image_path: Path) -> VisualVectorFingerprint:
    with Image.open(image_path) as raw_img:
        img = raw_img.convert("RGB")
        width, height = img.size
        aspect_ratio = round(width / max(1, height), 2)

        thumb = img.resize((256, 256), Image.Resampling.BILINEAR)
        arr = np.array(thumb, dtype=np.float32)

        luminance = (arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114) / 255.0
        lum_mean = float(np.mean(luminance))
        lum_contrast = float(np.std(luminance))

        laplacian = (
            np.roll(luminance, 1, axis=0) + np.roll(luminance, -1, axis=0) +
            np.roll(luminance, 1, axis=1) + np.roll(luminance, -1, axis=1) -
            4 * luminance
        )
        edge_energy = float(np.var(laplacian))
        complexity_index = min(1.0, max(0.0, edge_energy / 0.08))

        local_grad = np.abs(np.gradient(luminance)[0]) + np.abs(np.gradient(luminance)[1])
        flat_pixels = np.sum(local_grad < 0.04)
        whitespace_ratio = round(float(flat_pixels / (256 * 256)), 3)

        color_res = extract_color_palette(image_path)
        dominant_hex = color_res.dominant_color.hex_code
        dom_rgb = hex_to_rgb(dominant_hex)
        dom_lab = rgb_to_lab(*dom_rgb)

        return VisualVectorFingerprint(
            dominant_lab=dom_lab,
            palette_hex=color_res.hex_list,
            whitespace_ratio=whitespace_ratio,
            complexity_index=round(complexity_index, 3),
            luminance_mean=round(lum_mean, 3),
            contrast_ratio=round(lum_contrast, 3),
            aspect_ratio_decimal=aspect_ratio
        )

def extract_text_fingerprint(text: str, prohibited_terms: List[str]) -> TextVectorFingerprint:
    clean_text = text.strip()
    words = [w.lower().strip(".,!?;:\"'()[]") for w in clean_text.split() if w.strip()]
    word_count = len(words)
    unique_words = len(set(words))
    vocab_density = round(unique_words / max(1, word_count), 2)

    urgent_lexicon = {"urgent", "hurry", "limited", "now", "act", "instant", "guarantee", "cheap", "bargain", "clearance"}
    urgent_count = sum(1 for w in words if w in urgent_lexicon)
    urgency_score = round(min(1.0, urgent_count / max(1, word_count) * 4), 2)

    detected = []
    text_lower = clean_text.lower()
    for term in prohibited_terms:
        if term.lower() in text_lower:
            detected.append(term)

    return TextVectorFingerprint(
        word_count=word_count,
        char_count=len(clean_text),
        vocabulary_density=vocab_density,
        urgency_score=urgency_score,
        prohibited_term_count=len(detected),
        prohibited_terms_detected=detected
    )

def compute_biometric_vector_match(
    brand_dna: BrandDNAFingerprint,
    visual_fp: Optional[VisualVectorFingerprint] = None,
    text_fp: Optional[TextVectorFingerprint] = None
) -> BiometricVectorMatchResult:
    divergent: List[str] = []

    color_score = 100.0
    if visual_fp and brand_dna.target_palette_hex:
        cand_lab = visual_fp.dominant_lab
        min_delta_e = 999.0
        for approved_hex in brand_dna.target_palette_hex:
            try:
                ref_rgb = hex_to_rgb(approved_hex)
                ref_lab = rgb_to_lab(*ref_rgb)
                d_e = delta_e_from_lab(cand_lab, ref_lab)
                if d_e < min_delta_e:
                    min_delta_e = d_e
            except Exception:
                continue

        color_score = max(0.0, min(100.0, 100.0 - (min_delta_e * 2.0)))
        if min_delta_e > 15.0:
            divergent.append(f"Dominant color departs from approved palette (CIELAB ΔE = {min_delta_e:.1f})")

    whitespace_score = 100.0
    if visual_fp:
        ws_diff = abs(visual_fp.whitespace_ratio - brand_dna.target_whitespace_ratio)
        whitespace_score = max(0.0, min(100.0, (1.0 - (ws_diff * 1.5)) * 100.0))
        if ws_diff > 0.30:
            divergent.append(
                f"Negative space ratio ({visual_fp.whitespace_ratio:.0%}) deviates from brand standard ({brand_dna.target_whitespace_ratio:.0%})"
            )

    complexity_score = 100.0
    if visual_fp:
        cx_diff = abs(visual_fp.complexity_index - brand_dna.target_complexity_index)
        complexity_score = max(0.0, min(100.0, (1.0 - (cx_diff * 1.6)) * 100.0))
        if cx_diff > 0.35:
            divergent.append(
                f"Visual density/clutter index ({visual_fp.complexity_index:.2f}) departs from brand target ({brand_dna.target_complexity_index:.2f})"
            )

    copy_score = 100.0
    if text_fp:
        if text_fp.prohibited_term_count > 0:
            penalty = min(75.0, text_fp.prohibited_term_count * 25.0)
            copy_score -= penalty
            divergent.append(
                f"Contains {text_fp.prohibited_term_count} prohibited brand terms: {', '.join(text_fp.prohibited_terms_detected)}"
            )
        if text_fp.urgency_score > 0.40 and brand_dna.target_whitespace_ratio > 0.50:
            copy_score -= 15.0
            divergent.append("Copy displays aggressive sales urgency inconsistent with understated brand guidelines.")

        copy_score = max(0.0, min(100.0, copy_score))

    if visual_fp and text_fp:
        composite = (color_score * 0.35) + (whitespace_score * 0.20) + (complexity_score * 0.20) + (copy_score * 0.25)
    elif visual_fp:
        composite = (color_score * 0.45) + (whitespace_score * 0.30) + (complexity_score * 0.25)
    elif text_fp:
        composite = copy_score
    else:
        composite = 100.0

    return BiometricVectorMatchResult(
        color_dna_score=round(color_score, 1),
        whitespace_dna_score=round(whitespace_score, 1),
        complexity_dna_score=round(complexity_score, 1),
        copy_dna_score=round(copy_score, 1),
        composite_biometric_score=round(composite, 1),
        divergent_factors=divergent
    )

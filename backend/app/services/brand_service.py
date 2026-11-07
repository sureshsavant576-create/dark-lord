from __future__ import annotations
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from backend.app.ai.base import ProviderStatus
from backend.app.ai.gateway import ai_gateway
from backend.app.core.config import settings
from backend.app.models.brand import (
    BrandProfile,
    BrandProfileConfirmationRequest,
    BrandQuestionnaire,
    ProfileStatus,
    ReferenceAssetInfo,
)
from backend.app.preprocessing.color_extractor import clean_hex_code
from backend.app.preprocessing.pipeline import preprocessing_pipeline

logger = logging.getLogger(__name__)

def slugify_brand_name(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9\s-]", "", name).strip().lower()
    return re.sub(r"[\s-]+", "-", clean) or f"brand-{uuid.uuid4().hex[:6]}"

class BrandService:

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "brand_profiles.json")
        self._ensure_db()

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self.db_path.write_text("{}", encoding="utf-8")

    def _load_all(self) -> Dict[str, dict]:
        try:
            content = self.db_path.read_text(encoding="utf-8").strip()
            return json.loads(content) if content else {}
        except Exception as exc:
            logger.error("Error reading brand profiles database: %s", exc)
            return {}

    def _save_all(self, data: Dict[str, dict]) -> None:
        temp_path = self.db_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temp_path.replace(self.db_path)

    def get_brand_profile(self, brand_id: str) -> Optional[BrandProfile]:
        data = self._load_all()
        raw = data.get(brand_id)
        return BrandProfile(**raw) if raw else None

    def list_brand_profiles(self) -> List[BrandProfile]:
        data = self._load_all()
        return [BrandProfile(**item) for item in data.values()]

    def save_brand_profile(self, profile: BrandProfile) -> BrandProfile:
        data = self._load_all()
        profile.updated_at = datetime.now(timezone.utc).isoformat()
        data[profile.brand_id] = profile.model_dump()
        self._save_all(data)
        return profile

    async def create_brand_profile_draft(
        self,
        questionnaire: BrandQuestionnaire,
        uploaded_reference_paths: Optional[List[Path]] = None
    ) -> BrandProfile:
        brand_id = slugify_brand_name(questionnaire.brand_name)
        reference_assets: List[ReferenceAssetInfo] = []
        reference_texts: List[str] = []
        extracted_palette_candidates: List[str] = [clean_hex_code(c) for c in questionnaire.palette if clean_hex_code(c)]

        if uploaded_reference_paths:
            for path in uploaded_reference_paths:
                preprocessed = preprocessing_pipeline.preprocess(path)
                if not preprocessed.is_supported:
                    continue

                asset_id = f"ref-{uuid.uuid4().hex[:8]}"
                summary = preprocessed.extracted_text_summary

                if preprocessed.color_palette:
                    for hex_code in preprocessed.color_palette.hex_list:
                        cleaned = clean_hex_code(hex_code)
                        if cleaned and cleaned not in extracted_palette_candidates:
                            extracted_palette_candidates.append(cleaned)

                if preprocessed.document_data and preprocessed.document_data.full_text:
                    reference_texts.append(preprocessed.document_data.full_text[:4000])

                reference_assets.append(ReferenceAssetInfo(
                    asset_id=asset_id,
                    original_filename=path.name,
                    media_category=preprocessed.media_category,
                    stored_path=str(path),
                    sha256=preprocessed.validation.sha256_hash,
                    extracted_summary=summary[:300]
                ))

        q_dict = questionnaire.model_dump()
        ai_result = await ai_gateway.synthesize_brand_identity(
            questionnaire_data=q_dict,
            reference_texts=reference_texts
        )

        if ai_result.status == ProviderStatus.OPERATIONAL and ai_result.is_ai_generated:
            profile = BrandProfile(
                brand_id=brand_id,
                brand_name=questionnaire.brand_name,
                status=ProfileStatus.DRAFT_PENDING_CONFIRMATION,
                personality=ai_result.brand_personality or [questionnaire.personality],
                mood=ai_result.brand_mood or [questionnaire.mood],
                communication_tone=ai_result.communication_tone or [questionnaire.communication_tone],
                visual_style=ai_result.visual_style or [questionnaire.visual_style],
                target_audience=ai_result.target_audience or questionnaire.target_audience,
                approved_palette=list(set(extracted_palette_candidates + [p.upper() for p in ai_result.suggested_palette])),
                disallowed_elements=list(set(questionnaire.disallowed_elements + ai_result.disallowed_elements)),
                key_values=ai_result.key_values,
                mission_statement=questionnaire.tagline_or_mission or "",
                reference_assets=reference_assets,
                is_human_confirmed=False,
                ai_synthesized=True,
                ai_provider_used=ai_result.provider,
                ai_confidence_score=ai_result.confidence_score,
                synthesis_explanation=ai_result.raw_explanation
            )
        else:
            profile = BrandProfile(
                brand_id=brand_id,
                brand_name=questionnaire.brand_name,
                status=ProfileStatus.DRAFT_PENDING_CONFIRMATION,
                personality=[p.strip() for p in questionnaire.personality.split(",") if p.strip()],
                mood=[m.strip() for m in questionnaire.mood.split(",") if m.strip()],
                communication_tone=[t.strip() for t in questionnaire.communication_tone.split(",") if t.strip()],
                visual_style=[v.strip() for v in questionnaire.visual_style.split(",") if v.strip()],
                target_audience=questionnaire.target_audience,
                approved_palette=extracted_palette_candidates,
                disallowed_elements=questionnaire.disallowed_elements,
                key_values=[],
                mission_statement=questionnaire.tagline_or_mission or "",
                reference_assets=reference_assets,
                is_human_confirmed=False,
                ai_synthesized=False,
                ai_confidence_score=0.0,
                synthesis_explanation="Constructed deterministically from the company questionnaire."
            )

        self.save_brand_profile(profile)
        return profile

    def confirm_brand_profile(self, request: BrandProfileConfirmationRequest) -> BrandProfile:
        existing = self.get_brand_profile(request.brand_id)
        if not existing:
            raise ValueError(f"Brand profile with ID '{request.brand_id}' not found.")

        existing.personality = [p.strip() for p in request.personality if p.strip()]
        existing.mood = [m.strip() for m in request.mood if m.strip()]
        existing.communication_tone = [t.strip() for t in request.communication_tone if t.strip()]
        existing.visual_style = [v.strip() for v in request.visual_style if v.strip()]
        existing.target_audience = request.target_audience.strip()
        existing.approved_palette = [clean_hex_code(c) for c in request.approved_palette if clean_hex_code(c)]
        existing.disallowed_elements = [d.strip() for d in request.disallowed_elements if d.strip()]
        if request.key_values:
            existing.key_values = request.key_values

        if request.mission_statement:
            existing.mission_statement = request.mission_statement.strip()

        is_minimal = any("minimal" in s.lower() for s in (existing.visual_style + existing.personality))
        existing.brand_dna = {
            "target_whitespace_ratio": 0.65 if is_minimal else 0.40,
            "target_complexity_index": 0.20 if is_minimal else 0.45,
            "target_luminance_mean": 0.85 if is_minimal else 0.40,
            "target_palette_hex": existing.approved_palette
        }

        existing.status = ProfileStatus.CONFIRMED
        existing.is_human_confirmed = True
        existing.confirmed_by = request.confirmed_by
        existing.confirmation_notes = request.confirmation_notes

        return self.save_brand_profile(existing)

    async def scan_reference_features(self, file_path: Path) -> Dict[str, Any]:
        from backend.app.preprocessing.pipeline import preprocessing_pipeline
        from backend.app.ai.gateway import ai_gateway

        preprocessed = preprocessing_pipeline.preprocess(file_path=file_path)

        extracted_palette = preprocessed.extracted_colors_hex or []
        dominant_color = preprocessed.dominant_color_hex or ""

        ws = preprocessed.visual_fingerprint.whitespace_ratio if preprocessed.visual_fingerprint else 0.55
        cx = preprocessed.visual_fingerprint.complexity_index if preprocessed.visual_fingerprint else 0.25
        is_minimal = ws > 0.60 and cx < 0.35

        suggested_style = "Extreme Minimalism, Negative Space, High-contrast" if is_minimal else "Modern, Dynamic Layout, High Visual Impact"
        suggested_mood = "Minimalist, Calm, Focused" if is_minimal else "Bold, Dynamic, Engaging"
        suggested_personality = "Sophisticated, Premium, Focused" if is_minimal else "Innovative, Energetic, Bold"
        suggested_tone = "Clear, Direct, Inspiring"
        suggested_avoidances = "super cheap, bargain discount, clearance sale, miracle deal"
        extracted_motto = ""

        provider = ai_gateway.get_primary_provider()
        if provider and provider.is_configured():
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=provider.api_key)

                prompt = (
                    "Analyze this brand creative visual/poster. Identify its brand attributes and return ONLY a JSON object with:\n"
                    "- extracted_palette: array of 4-8 dominant uppercase HEX colors\n"
                    "- tagline_or_motto: any slogan, headline, or mission statement visible in the creative (or empty string if none)\n"
                    "- detected_mood: 2-3 emotional mood adjectives (e.g. Minimalist, Calm, Inspiring)\n"
                    "- detected_personality: 2-3 brand personality traits (e.g. Sophisticated, Premium, Focused)\n"
                    "- communication_tone: 2-3 communication tone descriptors (e.g. Clear, Direct, Professional)\n"
                    "- visual_style: 2-3 visual aesthetic descriptors (e.g. Extreme Minimalism, Negative Space)\n"
                    "- suggested_avoidances: 3-5 typical forbidden or cheap marketing claims that conflict with this brand identity\n"
                    "Return ONLY valid JSON."
                )

                with open(file_path, "rb") as f:
                    img_bytes = f.read()

                mime = preprocessed.validation.mime_type or "image/png"
                contents = [
                    types.Part.from_bytes(data=img_bytes, mime_type=mime),
                    prompt
                ]

                resp = client.models.generate_content(
                    model=provider.model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )

                if resp.text:
                    parsed = json.loads(resp.text)
                    if parsed.get("extracted_palette") and isinstance(parsed["extracted_palette"], list):
                        extracted_palette = list(dict.fromkeys(extracted_palette + [c.upper() for c in parsed["extracted_palette"] if c.startswith("#")]))
                    if parsed.get("detected_mood"):
                        suggested_mood = ", ".join(parsed["detected_mood"]) if isinstance(parsed["detected_mood"], list) else str(parsed["detected_mood"])
                    if parsed.get("detected_personality"):
                        suggested_personality = ", ".join(parsed["detected_personality"]) if isinstance(parsed["detected_personality"], list) else str(parsed["detected_personality"])
                    if parsed.get("communication_tone"):
                        suggested_tone = ", ".join(parsed["communication_tone"]) if isinstance(parsed["communication_tone"], list) else str(parsed["communication_tone"])
                    if parsed.get("visual_style"):
                        suggested_style = ", ".join(parsed["visual_style"]) if isinstance(parsed["visual_style"], list) else str(parsed["visual_style"])
                    if parsed.get("suggested_avoidances"):
                        suggested_avoidances = ", ".join(parsed["suggested_avoidances"]) if isinstance(parsed["suggested_avoidances"], list) else str(parsed["suggested_avoidances"])
                    if parsed.get("tagline_or_motto"):
                        extracted_motto = str(parsed["tagline_or_motto"]).strip()
            except Exception as e:
                logger.warning("Quick reference feature scan: %s", e)

        from backend.app.preprocessing.color_extractor import extract_detailed_palette
        try:
            detailed = extract_detailed_palette(file_path)
            detailed_palette_data = [p.model_dump() for p in detailed.palette]
            color_distribution = detailed.color_distribution
            harmony_type = detailed.harmony_type
        except Exception:
            detailed_palette_data = []
            color_distribution = []
            harmony_type = "Dynamic"

        return {
            "extracted_palette": extracted_palette,
            "dominant_color": dominant_color,
            "detailed_palette": detailed_palette_data,
            "color_distribution": color_distribution,
            "harmony_type": harmony_type,
            "suggested_personality": suggested_personality,
            "suggested_mood": suggested_mood,
            "suggested_tone": suggested_tone,
            "suggested_visual_style": suggested_style,
            "suggested_avoidances": suggested_avoidances,
            "extracted_motto": extracted_motto,
            "whitespace_ratio": round(ws, 2),
            "complexity_index": round(cx, 2)
        }

brand_service = BrandService()

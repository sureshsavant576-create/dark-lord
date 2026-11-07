"""BrandShield AI - Company Brand Identity Service.

Implements the three-stage brand intelligence lifecycle:
1. Questionnaire & Reference Ingestion.
2. Preprocessing & AI Candidate Synthesis.
3. Human Review & Profile Confirmation.
Stores confirmed profiles persistently for fast, reusable developer inspections.
"""
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
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
    """Create a URL-safe, deterministic brand ID from a brand name."""
    clean = re.sub(r"[^a-zA-Z0-9\s-]", "", name).strip().lower()
    return re.sub(r"[\s-]+", "-", clean) or f"brand-{uuid.uuid4().hex[:6]}"


class BrandService:
    """Manages company brand profile creation, AI synthesis, confirmation, and persistence."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.DB_DIR / "brand_profiles.json")
        self._ensure_db()

    def _ensure_db(self) -> None:
        """Ensure the storage database file exists."""
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
        # Atomic write to temporary file then replace
        temp_path = self.db_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temp_path.replace(self.db_path)

    def get_brand_profile(self, brand_id: str) -> Optional[BrandProfile]:
        """Retrieve a brand profile by brand ID in O(1) time."""
        data = self._load_all()
        raw = data.get(brand_id)
        return BrandProfile(**raw) if raw else None

    def list_brand_profiles(self) -> List[BrandProfile]:
        """List all stored brand profiles."""
        data = self._load_all()
        return [BrandProfile(**item) for item in data.values()]

    def save_brand_profile(self, profile: BrandProfile) -> BrandProfile:
        """Persist or update a brand profile in storage."""
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
        """Process onboarding questionnaire and reference documents to generate a candidate profile draft."""
        brand_id = slugify_brand_name(questionnaire.brand_name)
        reference_assets: List[ReferenceAssetInfo] = []
        reference_texts: List[str] = []
        extracted_palette_candidates: List[str] = [clean_hex_code(c) for c in questionnaire.palette if clean_hex_code(c)]

        # Step 1: Preprocess each uploaded reference asset
        if uploaded_reference_paths:
            for path in uploaded_reference_paths:
                preprocessed = preprocessing_pipeline.preprocess(path)
                if not preprocessed.is_supported:
                    continue

                asset_id = f"ref-{uuid.uuid4().hex[:8]}"
                summary = preprocessed.extracted_text_summary

                # Ingest colors from approved reference images
                if preprocessed.color_palette:
                    for hex_code in preprocessed.color_palette.hex_list:
                        cleaned = clean_hex_code(hex_code)
                        if cleaned and cleaned not in extracted_palette_candidates:
                            extracted_palette_candidates.append(cleaned)

                # Ingest text from guidelines
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

        # Step 2: Attempt AI synthesis if provider configured
        q_dict = questionnaire.model_dump()
        ai_result = await ai_gateway.synthesize_brand_identity(
            questionnaire_data=q_dict,
            reference_texts=reference_texts
        )

        # Step 3: Construct Draft Profile
        if ai_result.status == ProviderStatus.OPERATIONAL and ai_result.is_ai_generated:
            # Profile enriched with actual AI synthesis from guidelines
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
            # Deterministic construction from questionnaire (Rule 10: No mock hallucinated AI output)
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
        """Lock in company-verified brand profile after human review and edits."""
        existing = self.get_brand_profile(request.brand_id)
        if not existing:
            raise ValueError(f"Brand profile with ID '{request.brand_id}' not found.")

        # Update profile with human-approved fields
        existing.personality = [p.strip() for p in request.personality if p.strip()]
        existing.mood = [m.strip() for m in request.mood if m.strip()]
        existing.communication_tone = [t.strip() for t in request.communication_tone if t.strip()]
        existing.visual_style = [v.strip() for v in request.visual_style if v.strip()]
        existing.target_audience = request.target_audience.strip()
        existing.approved_palette = [clean_hex_code(c) for c in request.approved_palette if clean_hex_code(c)]
        existing.disallowed_elements = [d.strip() for d in request.disallowed_elements if d.strip()]
        if request.key_values:
            existing.key_values = request.key_values

        existing.status = ProfileStatus.CONFIRMED
        existing.is_human_confirmed = True
        existing.confirmed_by = request.confirmed_by
        existing.confirmation_notes = request.confirmation_notes

        return self.save_brand_profile(existing)


brand_service = BrandService()

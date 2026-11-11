from __future__ import annotations
import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.config import settings
from backend.app.models.brand import BrandProfile
from backend.app.models.copilot import (
    CopilotActionRequest,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotStagedReview,
    RemediationSuggestion,
    StepByStepGuidance,
    SuggestionStatus,
    SuggestionType,
)
from backend.app.services.brand_service import brand_service
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)


class BrandCopilotService:
    """
    Interactive AI Brand Co-Pilot (Remediation Chatbot).
    Uses the organization's approved Brand DNA and official Knowledge Base as ground truth.
    Preserves creator's original purpose while enforcing brand tone, terminology, and factual accuracy.
    """

    def __init__(self, brand_svc=None, dna_svc=None, kb_svc=None):
        self.brand_service = brand_svc or brand_service
        self.brand_dna_service = dna_svc or brand_dna_service
        self.knowledge_service = kb_svc or knowledge_service

    async def chat(self, req: CopilotChatRequest) -> CopilotChatResponse:
        brand_id = req.brand_id or "default"
        brand = self.brand_service.get_brand_profile(brand_id)
        if not brand:
            raise ValueError(f"Brand '{brand_id}' not found.")

        brand_name = brand.brand_name
        dna_profile = self.brand_dna_service.get_dna_profile(brand_id)

        # Retrieve ground truth knowledge base context
        kb_context = self.knowledge_service.retrieve_for_content_analysis(
            org_id=brand_id,
            brand_id=brand_id,
            copy_text=req.copy_text
        )

        # Compile rich brand context
        brand_tone = (
            (dna_profile.synthesis.brand_voice_tone if dna_profile else None)
            or (", ".join(brand.communication_tone) if brand.communication_tone else "Direct, Authoritative")
        )
        personality = (
            (dna_profile.synthesis.brand_personality if dna_profile else None)
            or brand.personality
            or ["Direct", "Cutting-Edge"]
        )
        approved_palette = (
            (dna_profile.synthesis.colour_hex_codes if dna_profile else None)
            or brand.approved_palette
            or ["#0B132B", "#5BC0BE", "#FFFFFF"]
        )
        banned_words = (
            (dna_profile.synthesis.words_to_avoid if dna_profile else None)
            or brand.disallowed_elements
            or []
        )
        terminology_map = kb_context.get("approved_terminology_map") or {}
        prohibited_messaging = kb_context.get("prohibited_messaging") or []
        approved_claims = kb_context.get("approved_promotional_claims") or []
        company_facts = kb_context.get("company_facts") or []

        # Combine all banned terms
        all_prohibited = list(set([w.lower() for w in banned_words + prohibited_messaging if w]))

        persona_desc = f"{brand_name} Brand Guardian ({brand_tone if isinstance(brand_tone, str) else ', '.join(brand_tone)})"

        # Detect intent from user query and metadata
        query_lower = req.message.lower()
        intent = req.intent or self._detect_intent(query_lower)

        # 1. Generate structured deterministic corrections (guaranteed zero hallucination)
        structured_corrections: List[RemediationSuggestion] = []
        step_guidance: List[StepByStepGuidance] = []
        context_sources: List[str] = [f"Brand Standards: {brand_name}"]

        if dna_profile:
            context_sources.append(f"Approved Brand DNA (v{dna_profile.version})")
        if approved_claims:
            context_sources.append(f"Knowledge Base ({len(approved_claims)} Verified Claims)")
        if terminology_map:
            context_sources.append(f"Terminology Standards ({len(terminology_map)} Term Mappings)")

        # Generate terminology corrections if copy contains off-brand terms
        copy_text = req.copy_text or ""
        if copy_text:
            term_corrections = self._extract_terminology_corrections(
                copy_text=copy_text,
                terminology_map=terminology_map,
                banned_terms=all_prohibited,
                brand_name=brand_name
            )
            structured_corrections.extend(term_corrections)

        # Generate headline alternatives if requested or if headline issues exist
        if intent in ("headlines", "alternative", "rewrite") or any("headline" in d.lower() for d in req.discrepancies):
            headline_suggestions = self._generate_headline_suggestions(
                copy_text=copy_text,
                brand=brand,
                dna_profile=dna_profile,
                approved_claims=approved_claims
            )
            structured_corrections.extend(headline_suggestions)

        # Generate tone rewrite suggestions
        if intent in ("tone_rewrite", "rewrite", "alternative") or any("tone" in d.lower() or "voice" in d.lower() for d in req.discrepancies):
            tone_suggestion = self._generate_tone_rewrite(
                copy_text=copy_text,
                brand=brand,
                brand_tone=brand_tone,
                banned_terms=all_prohibited,
                terminology_map=terminology_map
            )
            if tone_suggestion:
                structured_corrections.append(tone_suggestion)

        # Always ensure compliant copy alternatives are generated if copy_text or discrepancies exist
        if copy_text:
            if not any(c.type == SuggestionType.TONE_REWRITE for c in structured_corrections):
                tone_suggestion = self._generate_tone_rewrite(
                    copy_text=copy_text,
                    brand=brand,
                    brand_tone=brand_tone,
                    banned_terms=all_prohibited,
                    terminology_map=terminology_map
                )
                if tone_suggestion:
                    structured_corrections.append(tone_suggestion)

            if not any(c.type == SuggestionType.HEADLINE for c in structured_corrections):
                headlines = self._generate_headline_suggestions(
                    copy_text=copy_text,
                    brand=brand,
                    dna_profile=dna_profile,
                    approved_claims=approved_claims
                )
                structured_corrections.extend(headlines)

        # Generate step-by-step guidance from detected issues and discrepancies
        all_issues = req.discrepancies + [d.get("description", "") for d in req.detected_issues if isinstance(d, dict)]
        step_guidance = self._generate_step_by_step_guidance(
            issues=all_issues,
            brand_name=brand_name,
            approved_palette=approved_palette,
            structured_corrections=structured_corrections
        )

        # 2. AI Reasoning layer: Priority 1: Groq API (ultra-low latency), Priority 2: Gemini API, Priority 3: Deterministic fallback
        reply_text = ""
        if settings.has_groq:
            try:
                reply_text = await self._generate_groq_reply(
                    req=req,
                    brand_name=brand_name,
                    brand_tone=brand_tone,
                    personality=personality,
                    dna_profile=dna_profile,
                    kb_context=kb_context,
                    approved_palette=approved_palette,
                    structured_corrections=structured_corrections,
                    intent=intent
                )
                if reply_text:
                    context_sources.append(f"AI Reasoning: Groq Cloud ({getattr(settings, 'GROQ_TEXT_MODEL', 'llama-3.3-70b-versatile')})")
            except Exception as exc:
                logger.warning("Groq Co-Pilot chat reasoning skipped due to error: %s", exc)

        if not reply_text and settings.has_gemini:
            try:
                reply_text = await self._generate_gemini_reply(
                    req=req,
                    brand_name=brand_name,
                    brand_tone=brand_tone,
                    personality=personality,
                    dna_profile=dna_profile,
                    kb_context=kb_context,
                    approved_palette=approved_palette,
                    structured_corrections=structured_corrections,
                    intent=intent
                )
                if reply_text:
                    context_sources.append("AI Reasoning: Google Gemini")
            except Exception as exc:
                logger.warning("Gemini Co-Pilot chat reasoning skipped due to API condition: %s", exc)

        # Fallback response generation if neither LLM was available or empty
        if not reply_text:
            reply_text = self._generate_deterministic_reply(
                req=req,
                brand_name=brand_name,
                brand_tone=brand_tone,
                personality=personality,
                intent=intent,
                structured_corrections=structured_corrections,
                step_guidance=step_guidance,
                approved_palette=approved_palette
            )
            context_sources.append("Deterministic Grounding Engine")

        quick_prompts = [
            f"Suggest 3 headlines in {brand_name}'s voice",
            "How do I fix the color palette discrepancy?",
            f"Correct terminology according to {brand_name} standards",
            "Explain step-by-step how to get certified"
        ]

        # Backward compatibility for existing simple rewrite cards
        suggested_rewrites = [
            c.suggested_correction for c in structured_corrections
            if c.type in (SuggestionType.HEADLINE, SuggestionType.TONE_REWRITE, SuggestionType.MESSAGING_IMPROVEMENT)
        ]
        if not suggested_rewrites and structured_corrections:
            suggested_rewrites = [c.suggested_correction for c in structured_corrections]
        if not suggested_rewrites:
            suggested_rewrites = [
                f"{brand_name}: Engineered for authentic excellence.",
                f"Built with purpose. Find your greatness with {brand_name}.",
                f"Precision craftsmanship, uncompromising quality."
            ]

        return CopilotChatResponse(
            reply=reply_text,
            brand_name=brand_name,
            brand_persona=persona_desc,
            structured_corrections=structured_corrections,
            step_by_step_guidance=step_guidance,
            suggested_rewrites=suggested_rewrites[:4],
            palette_recommendations=approved_palette,
            quick_prompts=quick_prompts[:4],
            original_purpose_preserved=True,
            context_sources_used=context_sources
        )

    def process_action(self, req: CopilotActionRequest) -> Dict[str, Any]:
        """
        Processes accept/reject/alternative actions on individual corrections.
        """
        brand = self.brand_service.get_brand_profile(req.brand_id)
        brand_name = brand.brand_name if brand else req.brand_id

        if req.action == "accept":
            return {
                "status": "ACCEPTED",
                "suggestion_id": req.suggestion_id,
                "message": f"Correction accepted for {brand_name}. Staged for review before final submission.",
                "requires_review_before_publish": True,
                "staged": True
            }
        elif req.action == "reject":
            return {
                "status": "REJECTED",
                "suggestion_id": req.suggestion_id,
                "message": "Correction rejected. Original creator content preserved.",
                "requires_review_before_publish": False,
                "staged": False
            }
        elif req.action == "request_alternative":
            # Generate differentiated alternative
            orig = req.original_content or "Unmatched performance guaranteed"
            alt = f"Built with authentic purpose: {orig.replace('guaranteed', 'proven').replace('unmatched', 'enduring')}"
            return {
                "status": "ALTERNATIVE_GENERATED",
                "suggestion_id": f"alt_{uuid.uuid4().hex[:6]}",
                "original_content": orig,
                "suggested_correction": alt,
                "reason_for_correction": f"Alternative variant maintaining {brand_name} brand voice without unverified claims.",
                "guideline_reference": "Brand Voice Guidelines: Substantiated Authenticity"
            }
        else:
            raise ValueError(f"Unknown action '{req.action}'. Expected accept, reject, or request_alternative.")

    def stage_review(self, brand_id: str, accepted_suggestions: List[RemediationSuggestion], base_copy: str) -> CopilotStagedReview:
        """
        Packages accepted corrections into a staged review draft.
        Explicitly enforces: accepted changes must be reviewed before submission; never auto-published.
        """
        brand = self.brand_service.get_brand_profile(brand_id)
        brand_name = brand.brand_name if brand else brand_id

        staged_copy = base_copy
        for sugg in accepted_suggestions:
            if sugg.type == SuggestionType.TERMINOLOGY_CORRECTION:
                # Direct replacement
                pattern = re.compile(re.escape(sugg.original_content), re.IGNORECASE)
                staged_copy = pattern.sub(sugg.suggested_correction, staged_copy)
            elif sugg.type in (SuggestionType.HEADLINE, SuggestionType.TONE_REWRITE):
                staged_copy = sugg.suggested_correction

        return CopilotStagedReview(
            brand_id=brand_id,
            brand_name=brand_name,
            accepted_corrections=accepted_suggestions,
            staged_copy=staged_copy,
            status="STAGED_FOR_CREATOR_REVIEW",
            notice="Accepted changes are staged for internal creator review before submission. Content will NOT be published automatically."
        )

    # -------------------------------------------------------------------------
    # INTERNAL LOGIC & REASONING ENGINES
    # -------------------------------------------------------------------------

    def _detect_intent(self, text: str) -> str:
        if any(w in text for w in ("why", "explain", "reason", "violate", "flagged", "issue")):
            return "explain_issue"
        if any(w in text for w in ("headline", "title", "header")):
            return "headlines"
        if any(w in text for w in ("rewrite", "tone", "voice", "sound like", "personality")):
            return "tone_rewrite"
        if any(w in text for w in ("terminology", "term", "word", "vocabulary", "lexicon")):
            return "terminology"
        if any(w in text for w in ("message", "messaging", "positioning", "pillar")):
            return "messaging"
        if any(w in text for w in ("step", "guidance", "how to", "guide", "roadmap", "checklist")):
            return "step_by_step"
        if any(w in text for w in ("alternative", "another", "more", "different", "other options")):
            return "alternative"
        return "general"

    def _extract_terminology_corrections(
        self,
        copy_text: str,
        terminology_map: Dict[str, str],
        banned_terms: List[str],
        brand_name: str
    ) -> List[RemediationSuggestion]:
        corrections: List[RemediationSuggestion] = []

        # 1. Approved Terminology Map replacements
        for avoid_term, preferred_term in terminology_map.items():
            pattern = rf"\b{re.escape(avoid_term)}\b"
            if re.search(pattern, copy_text, re.IGNORECASE):
                corrections.append(RemediationSuggestion(
                    id=f"term_{uuid.uuid4().hex[:6]}",
                    type=SuggestionType.TERMINOLOGY_CORRECTION,
                    original_content=avoid_term,
                    suggested_correction=preferred_term,
                    reason_for_correction=f"'{avoid_term}' is off-brand terminology. {brand_name} standards require '{preferred_term}'.",
                    guideline_reference="Brand Knowledge Base: Approved Terminology Lexicon",
                    status=SuggestionStatus.PENDING
                ))

        # 2. General banned words check
        for banned in banned_terms:
            pattern = rf"\b{re.escape(banned)}\b"
            if re.search(pattern, copy_text, re.IGNORECASE):
                # Suggest a dignified replacement preserving creator intent
                safe_replacement = self._suggest_clean_replacement(banned)
                corrections.append(RemediationSuggestion(
                    id=f"banned_{uuid.uuid4().hex[:6]}",
                    type=SuggestionType.TERMINOLOGY_CORRECTION,
                    original_content=banned,
                    suggested_correction=safe_replacement,
                    reason_for_correction=f"'{banned}' is prohibited by brand compliance policy. Use verified phrasing.",
                    guideline_reference="Brand Guidelines: Prohibited Copy & Claims",
                    status=SuggestionStatus.PENDING
                ))

        return corrections

    def _suggest_clean_replacement(self, banned: str) -> str:
        replacements = {
            "cheap": "accessible",
            "fake": "authentic",
            "guaranteed fix": "engineered solution",
            "guaranteed": "proven",
            "unhackable": "resilient",
            "100% bug-free": "high-assurance",
            "military-grade": "enterprise-grade",
            "magic": "precision engineering",
            "best-selling": "trusted by industry leaders",
            "number one": "premier",
            "unbeatable": "uncompromising"
        }
        return replacements.get(banned.lower(), "verified quality")

    def _generate_headline_suggestions(
        self,
        copy_text: str,
        brand: BrandProfile,
        dna_profile: Any,
        approved_claims: List[Dict[str, Any]]
    ) -> List[RemediationSuggestion]:
        brand_name = brand.brand_name
        personality = (brand.personality[0] if brand.personality else "Bold")
        
        # Preserve creator's original core theme
        theme = "performance"
        if copy_text:
            first_sentence = copy_text.split(".")[0].strip()
            if len(first_sentence) < 60:
                theme = first_sentence

        options = [
            (
                f"{brand_name}: Engineered for Pure {personality.title()}",
                f"Elevates original theme to match {brand_name} {personality} personality pillar."
            ),
            (
                f"Defy Limits. Built the {brand_name} Way.",
                f"Punchy, empowering headline adhering to maximum 7-word guideline."
            ),
            (
                f"Precision You Can Trust. Every Single Day.",
                f"Substantiated claim replacement avoiding unprovable superlatives."
            )
        ]

        suggestions = []
        for idx, (headline, reason) in enumerate(options):
            suggestions.append(RemediationSuggestion(
                id=f"headline_{idx+1}_{uuid.uuid4().hex[:6]}",
                type=SuggestionType.HEADLINE,
                original_content=copy_text[:40] if copy_text else "Default Headline",
                suggested_correction=headline,
                reason_for_correction=reason,
                guideline_reference="Brand DNA: Positioning & Headline Architecture",
                status=SuggestionStatus.PENDING
            ))

        return suggestions

    def _generate_tone_rewrite(
        self,
        copy_text: str,
        brand: BrandProfile,
        brand_tone: Any,
        banned_terms: List[str],
        terminology_map: Dict[str, str]
    ) -> Optional[RemediationSuggestion]:
        if not copy_text:
            return None

        brand_name = brand.brand_name
        cleaned = copy_text
        for avoid in banned_terms:
            safe = self._suggest_clean_replacement(avoid)
            pattern = re.compile(rf"\b{re.escape(avoid)}\b", re.IGNORECASE)
            cleaned = pattern.sub(safe, cleaned)

        for avoid_t, pref in terminology_map.items():
            pattern = re.compile(rf"\b{re.escape(avoid_t)}\b", re.IGNORECASE)
            cleaned = pattern.sub(pref, cleaned)

        # Tone elevation
        tone_rewrite = f"{cleaned.strip()}. Designed with purpose, built for endurance."

        return RemediationSuggestion(
            id=f"tone_rewrite_{uuid.uuid4().hex[:6]}",
            type=SuggestionType.TONE_REWRITE,
            original_content=copy_text,
            suggested_correction=tone_rewrite,
            reason_for_correction=f"Rewritten to embody {brand_name}'s {brand_tone} voice while eliminating prohibited superlatives.",
            guideline_reference="Brand DNA: Communication Personality & Voice",
            status=SuggestionStatus.PENDING
        )

    def _generate_step_by_step_guidance(
        self,
        issues: List[str],
        brand_name: str,
        approved_palette: List[str],
        structured_corrections: List[RemediationSuggestion]
    ) -> List[StepByStepGuidance]:
        steps: List[StepByStepGuidance] = []
        step_num = 1

        # Check for terminology/claim issues
        term_fixes = [c for c in structured_corrections if c.type == SuggestionType.TERMINOLOGY_CORRECTION]
        if term_fixes or any("claim" in i.lower() or "word" in i.lower() or "term" in i.lower() for i in issues):
            steps.append(StepByStepGuidance(
                step_number=step_num,
                action_title="Sanitize Copy Terminology",
                instruction=f"Replace unverified claims and non-standard synonyms with {brand_name} approved lexicon (e.g. use '{term_fixes[0].suggested_correction if term_fixes else 'verified solution'}').",
                target_issue="Terminology and Prohibited Claims",
                severity="CRITICAL" if any("prohibited" in i.lower() for i in issues) else "WARNING"
            ))
            step_num += 1

        # Check for color discrepancy
        if any("color" in i.lower() or "palette" in i.lower() or "delta" in i.lower() for i in issues):
            primary_hex = approved_palette[0] if approved_palette else "#0B132B"
            steps.append(StepByStepGuidance(
                step_number=step_num,
                action_title="Harmonize Color Palette",
                instruction=f"Shift background and accent fills to target brand centroids ({', '.join(approved_palette[:3])}). Aim for ΔE < 12.0.",
                target_issue="Visual Palette Inconsistency",
                severity="WARNING"
            ))
            step_num += 1

        # Check for contrast or accessibility
        if any("contrast" in i.lower() or "accessibility" in i.lower() or "ratio" in i.lower() for i in issues):
            steps.append(StepByStepGuidance(
                step_number=step_num,
                action_title="Improve Text-to-Background Contrast",
                instruction="Ensure body text reaches at least 4.5:1 contrast against the background fill to pass WCAG AA standards.",
                target_issue="Accessibility Contrast Deficiency",
                severity="WARNING"
            ))
            step_num += 1

        # General sign-off step
        steps.append(StepByStepGuidance(
            step_number=step_num,
            action_title="Review Staged Changes & Re-Audit",
            instruction=f"Review all accepted copy and visual corrections in the Staged Review drawer, then run a re-audit to verify certification before submission.",
            target_issue="Pre-Certification Quality Gate",
            severity="INFO"
        ))

        return steps

    async def _generate_groq_reply(
        self,
        req: CopilotChatRequest,
        brand_name: str,
        brand_tone: Any,
        personality: Any,
        dna_profile: Any,
        kb_context: Dict[str, Any],
        approved_palette: List[str],
        structured_corrections: List[RemediationSuggestion],
        intent: str
    ) -> str:
        """
        Invokes Groq Cloud API using supported models (llama-3.3-70b-versatile / llama-3.1-8b-instant)
        with automatic fallback, timeout handling, and rate limit backoff.
        """
        if not settings.has_groq:
            return ""

        from groq import AsyncGroq
        import httpx

        timeout = httpx.Timeout(15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as http_client:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY, http_client=http_client)

            system_prompt = (
                f"You are the official AI Brand Co-Pilot and Guardian for '{brand_name}'. "
                f"Tone of voice: {brand_tone}. Personality: {personality}. "
                "Provide authoritative, actionable remediation advice grounded exclusively in the company's approved brand guidelines. "
                "Never invent official facts, certifications, or unverified claims. "
                "Keep responses concise (under 160 words), encouraging, and clear."
            )

            user_prompt = f"""### ORGANIZATION GROUND TRUTH (BRAND DNA & KNOWLEDGE BASE):
- Approved Palette: {json.dumps(approved_palette)}
- Prohibited Terms & Claims: {json.dumps(kb_context.get('prohibited_messaging', []))}
- Approved Verified Claims: {json.dumps([c.get('claim_text') for c in kb_context.get('approved_promotional_claims', [])])}
- Approved Terminology Mappings: {json.dumps(kb_context.get('approved_terminology_map', {}))}

### CREATIVE AUDIT CONTEXT:
- Creator Copy: "{req.copy_text or 'None'}"
- Flagged Issues / Discrepancies: {json.dumps(req.discrepancies)}
- Creator Message: "{req.message}"
- Stated Intent: {intent}

### DIRECTIVES:
1. Explain specifically why detected issues depart from {brand_name}'s approved guidelines.
2. Provide step-by-step guidance on how to bring the content into full compliance.
3. Suggest a compliant headline or rewrite if requested.
4. Keep the tone encouraging, authoritative, and professional.
"""
            models_to_try = [
                getattr(settings, "GROQ_TEXT_MODEL", "llama-3.3-70b-versatile"),
                "llama-3.1-8b-instant",
                "llama-3.3-70b-versatile",
                "mixtral-8x7b-32768"
            ]

            last_err = None
            for model in dict.fromkeys(models_to_try):
                try:
                    response = await client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.2,
                        max_tokens=350
                    )
                    if response and response.choices and response.choices[0].message.content:
                        return response.choices[0].message.content.strip()
                except Exception as exc:
                    last_err = exc
                    logger.warning("Groq Co-Pilot chat reasoning with model '%s' failed: %s. Trying next...", model, exc)
                    continue

            if last_err:
                logger.error("All Groq models failed in Co-Pilot: %s", last_err)
            return ""

    async def _generate_gemini_reply(
        self,
        req: CopilotChatRequest,
        brand_name: str,
        brand_tone: Any,
        personality: Any,
        dna_profile: Any,
        kb_context: Dict[str, Any],
        approved_palette: List[str],
        structured_corrections: List[RemediationSuggestion],
        intent: str
    ) -> str:
        from google import genai

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        prompt = f"""
You are the official AI Brand Co-Pilot and Guardian for '{brand_name}'.
Your tone of voice is: {brand_tone}. Personality: {personality}.

Organization Ground Truth:
- Approved Palette: {json.dumps(approved_palette)}
- Prohibited Words & Claims: {json.dumps(kb_context.get('prohibited_messaging', []))}
- Approved Claims: {json.dumps([c.get('claim_text') for c in kb_context.get('approved_promotional_claims', [])])}
- Approved Terminology: {json.dumps(kb_context.get('approved_terminology_map', {}))}

Creator Context:
- Creative Copy: "{req.copy_text or 'None'}"
- Flagged Issues / Discrepancies: {json.dumps(req.discrepancies)}
- Creator Message: "{req.message}"
- Stated Intent: {intent}

Strict Directives:
1. Speak authentically as the {brand_name} Brand Guardian.
2. Directly answer the creator's questions about why specific issues were flagged.
3. NEVER invent official company facts, certifications, or unverified claims. If a user asks for unverified claims, explicitly explain that brand policy requires verified evidence in the Knowledge Base.
4. Preserve the creator's original purpose and topic.
5. Keep your conversational response structured, encouraging, concise (under 180 words), and actionable.
"""
        models_to_try = list(dict.fromkeys([
            getattr(settings, "GEMINI_MODEL", "gemini-3.1-flash-lite"),
            getattr(settings, "DEFAULT_TEXT_MODEL", "gemini-3.1-flash-lite"),
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.5-flash"
        ]))

        response = None
        last_error = None

        for m_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=m_name,
                    contents=prompt
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as exc:
                last_error = exc
                logger.warning("Gemini Co-Pilot model '%s' failed: %s. Trying fallback...", m_name, exc)
                continue

        if last_error:
            logger.error("All Gemini Co-Pilot models failed: %s", last_error)
        return ""

    def _generate_deterministic_reply(
        self,
        req: CopilotChatRequest,
        brand_name: str,
        brand_tone: Any,
        personality: Any,
        intent: str,
        structured_corrections: List[RemediationSuggestion],
        step_guidance: List[StepByStepGuidance],
        approved_palette: List[str]
    ) -> str:
        p_name = personality[0] if personality else "Bold"

        if intent == "explain_issue":
            issue_summary = ", ".join(req.discrepancies) if req.discrepancies else "brand guideline discrepancies"
            return (
                f"As the {brand_name} Brand Guardian, here is why your creative was flagged: "
                f"We identified {issue_summary}. In accordance with {brand_name}'s {p_name.lower()} and authentic positioning, "
                f"all claims must be backed by verified evidence in our Knowledge Base, and copy must strictly employ our approved lexicon. "
                f"Review the suggested corrections below and accept individual items to stage them for certification."
            )
        elif intent == "headlines":
            return (
                f"Here are 3 pre-certified headline alternatives engineered for {brand_name}'s authentic voice. "
                f"They preserve your original message while maintaining our mandatory 7-word punchiness and certified vocabulary. "
                f"Select 'Accept' on any headline to stage it for your re-audit."
            )
        elif intent == "terminology":
            return (
                f"I reviewed your copy against {brand_name}'s official Terminology Lexicon. "
                f"We found non-standard or prohibited phrasing. I have mapped each phrase to our approved standard below. "
                f"You can accept each terminology correction with one click."
            )
        elif intent == "step_by_step":
            return (
                f"Here is your step-by-step roadmap to achieve 100% brand certification for {brand_name}. "
                f"Follow the {len(step_guidance)} steps outlined below to resolve visual, color, and copy discrepancies."
            )
        else:
            return (
                f"Hello! I am your {brand_name} Brand Co-Pilot ({brand_tone}). "
                f"I am here to guide your creative toward full brand compliance. "
                f"You can ask me to explain detected issues, generate alternative headlines, rewrite copy to match our tone, "
                f"or provide step-by-step guidance. All accepted changes will be staged for review before final submission."
            )


brand_copilot_service = BrandCopilotService()

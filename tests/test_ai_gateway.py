"""Tests for BrandShield AI Provider Gateway and Rules Compliance.

Verifies:
- Rule 10: No fictional results when API is unavailable.
- Rule 11: Clear distinction between AI and deterministic results.
- Unconfigured status reporting and error diagnostics.
"""
import pytest
from backend.app.ai.base import (
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.ai.gateway import AIGateway
from backend.app.ai.gemini_provider import GeminiProvider
from backend.app.ai.openai_provider import OpenAIProvider


def test_gateway_initialization():
    """Verify all providers are registered in the gateway."""
    gateway = AIGateway()
    assert "gemini" in gateway.providers
    assert "openai" in gateway.providers
    assert "huggingface" in gateway.providers


def test_unconfigured_provider_detection():
    """Verify that unconfigured providers accurately report False for is_configured."""
    dummy_gemini = GeminiProvider(api_key="")
    assert dummy_gemini.is_configured() is False

    dummy_openai = OpenAIProvider(api_key="")
    assert dummy_openai.is_configured() is False


@pytest.mark.asyncio
async def test_unconfigured_gateway_inspection_rules_compliance():
    """Strict Rule 10 & 11 verification:

    When no API key is provided, the gateway MUST NOT invent similarity scores,
    and MUST mark is_ai_generated as False with ProviderStatus.UNCONFIGURED.
    """
    gateway = AIGateway()
    # Force all providers unconfigured for deterministic testing of the fallback
    gateway.providers["gemini"] = GeminiProvider(api_key="")
    gateway.providers["openai"] = OpenAIProvider(api_key="")

    req = ContentAnalysisRequest(
        mime_type="image/png",
        extracted_text="Sale 50% Off Today!",
        extracted_colors=["#FF0000", "#FFFFFF"]
    )
    target_profile = {
        "brand_name": "TestCorp",
        "personality": "Energetic",
        "mood": "Youthful",
        "tone": "Friendly"
    }

    result: MultimodalEvaluation = await gateway.analyze_creative_content(req, target_profile)

    # Must NOT hallucinate an AI score
    assert result.alignment_score is None
    assert result.status == ProviderStatus.UNCONFIGURED
    assert result.is_ai_generated is False
    assert "No AI provider is configured" in result.detailed_analysis
    assert result.confidence_score == 0.0


@pytest.mark.asyncio
async def test_unconfigured_brand_synthesis():
    """Verify unconfigured brand synthesis returns error state without fabricating profile values."""
    gateway = AIGateway()
    gateway.providers["gemini"] = GeminiProvider(api_key="")
    gateway.providers["openai"] = OpenAIProvider(api_key="")

    synthesis = await gateway.synthesize_brand_identity(
        questionnaire_data={"personality": "Vibrant"},
        reference_texts=["Guidelines excerpt"]
    )

    assert synthesis.status == ProviderStatus.UNCONFIGURED
    assert synthesis.is_ai_generated is False
    assert len(synthesis.brand_personality) == 0

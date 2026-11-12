import pytest
from backend.app.ai.base import (
    ContentAnalysisRequest,
    MultimodalEvaluation,
    ProviderStatus,
)
from backend.app.ai.gateway import AIGateway
from backend.app.ai.gemini_provider import GeminiProvider
from backend.app.ai.groq_provider import GroqProvider

def test_gateway_initialization():
    gateway = AIGateway()
    assert "gemini" in gateway.providers
    assert "groq" in gateway.providers

def test_unconfigured_provider_detection():
    dummy_gemini = GeminiProvider(api_key="")
    dummy_groq = GroqProvider(api_key="")
    assert dummy_gemini.is_configured() is False
    assert dummy_groq.is_configured() is False

@pytest.mark.asyncio
async def test_unconfigured_gateway_inspection_rules_compliance():
    gateway = AIGateway()
    gateway.providers["gemini"] = GeminiProvider(api_key="")
    gateway.providers["groq"] = GroqProvider(api_key="")

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

    assert result.alignment_score is None
    assert result.status == ProviderStatus.UNCONFIGURED
    assert result.is_ai_generated is False
    assert "Gemini API is unconfigured" in result.detailed_analysis or "unconfigured" in result.detailed_analysis.lower()
    assert result.confidence_score == 0.0

@pytest.mark.asyncio
async def test_unconfigured_brand_synthesis():
    gateway = AIGateway()
    gateway.providers["gemini"] = GeminiProvider(api_key="")
    gateway.providers["groq"] = GroqProvider(api_key="")

    synthesis = await gateway.synthesize_brand_identity(
        questionnaire_data={"personality": "Vibrant"},
        reference_texts=["Guidelines excerpt"]
    )

    assert synthesis.status == ProviderStatus.UNCONFIGURED
    assert synthesis.is_ai_generated is False
    assert len(synthesis.brand_personality) == 0

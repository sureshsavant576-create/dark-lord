import os
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import Settings, settings
from backend.app.services.remediation_service import creative_remediation_service
from backend.app.services.supabase_service import supabase_service

client = TestClient(app)


def test_only_three_services_registered_and_no_secret_exposure():
    status = settings.get_provider_status_dict()
    assert "gemini" in status
    assert "groq" in status
    assert "supabase" in status
    assert "deterministic_local" in status
    assert "openai" not in status
    assert "huggingface" not in status

    raw_str = str(status)
    for secret_env in ("GEMINI_API_KEY", "GROQ_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"):
        val = os.getenv(secret_env)
        if val and len(val.strip()) > 8:
            assert val.strip() not in raw_str


def test_supabase_url_normalization_and_keys():
    s = Settings(
        SUPABASE_URL="https://supabase.com/dashboard/project/abc123xyz",
        SUPABASE_ANON_KEY="sb_publishable_dummy",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_dummy",
    )
    assert s.resolved_supabase_url == "https://abc123xyz.supabase.co"
    assert s.has_supabase is True
    assert s.supabase_anon_key == "sb_publishable_dummy"
    assert s.supabase_service_key == "sb_secret_dummy"


def test_providers_and_supabase_status_endpoints_no_secrets():
    res_p = client.get("/api/v1/providers")
    assert res_p.status_code == 200
    body_p = res_p.json()
    providers = body_p.get("providers", {})
    assert "gemini" in providers
    assert "groq" in providers
    assert "supabase" in providers
    assert "openai" not in providers
    assert "huggingface" not in providers

    res_s = client.get("/api/v1/brands/dna/supabase/status")
    assert res_s.status_code == 200
    s_data = res_s.json()
    assert "recommended_sql_schema" in s_data
    assert "organizations" in s_data.get("tables", [])


def test_remediation_never_uses_groq_text_as_image_editor():
    # Ensure Groq provider key alone does not enable generative image editing
    original_key = settings.GEMINI_API_KEY
    try:
        settings.GEMINI_API_KEY = None
        assert creative_remediation_service._check_generative_api_availability() is False
    finally:
        settings.GEMINI_API_KEY = original_key

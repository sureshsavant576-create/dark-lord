"""Tests for BrandShield AI Central Configuration."""
from pathlib import Path
from backend.app.core.config import Settings, settings


def test_settings_initialization():
    """Verify settings defaults, storage directories, and app metadata."""
    assert settings.APP_NAME == "Sanket AI"
    assert settings.API_V1_PREFIX == "/api/v1"
    assert settings.STORAGE_DIR.exists()
    assert settings.UPLOADS_DIR.exists()
    assert settings.GUIDELINES_DIR.exists()


def test_provider_status_dict_safety():
    """Verify that get_provider_status_dict does not leak raw API secret values."""
    status = settings.get_provider_status_dict()
    assert "gemini" in status
    assert "deterministic_local" in status

    # Verify that raw keys are NOT present in the returned dictionary
    for provider, data in status.items():
        assert "api_key" not in data
        assert "secret" not in data
        assert "token" not in data


def test_custom_settings_instance(tmp_path: Path):
    """Verify that settings can be instantiated with custom paths for isolation."""
    custom = Settings(DATA_DIR=tmp_path / "data", STORAGE_DIR=tmp_path / "storage")
    custom.init_directories()
    assert (tmp_path / "data").exists()
    assert (tmp_path / "storage").exists()

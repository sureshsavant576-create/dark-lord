import shutil
import tempfile
from pathlib import Path
import pytest

from backend.app.core.config import settings
from backend.app.services.brand_service import brand_service
from backend.app.services.inspection_service import inspection_service
import backend.app.core.auth as auth_mod

@pytest.fixture(autouse=True, scope="session")
def isolate_test_environment():
    temp_dir = tempfile.mkdtemp(prefix="brandshield_test_")
    temp_path = Path(temp_dir)
    test_db = temp_path / "db"
    test_db.mkdir(parents=True, exist_ok=True)
    test_storage = temp_path / "storage"
    test_guidelines = test_storage / "guidelines"
    test_uploads = test_storage / "uploads"
    test_guidelines.mkdir(parents=True, exist_ok=True)
    test_uploads.mkdir(parents=True, exist_ok=True)

    orig_brand_db = brand_service.db_path
    orig_insp_db = inspection_service.db_path
    orig_users_path = auth_mod.USERS_DB_PATH
    orig_revoked_path = auth_mod.REVOKED_SESSIONS_PATH
    orig_storage_dir = settings.STORAGE_DIR
    orig_uploads_dir = settings.UPLOADS_DIR
    orig_guidelines_dir = settings.GUIDELINES_DIR

    brand_service.db_path = test_db / "brand_profiles.json"
    brand_service._ensure_db()
    inspection_service.db_path = test_db / "inspection_reports.json"
    inspection_service._ensure_db()
    auth_mod.USERS_DB_PATH = test_db / "users.json"
    auth_mod.REVOKED_SESSIONS_PATH = test_db / "revoked_sessions.json"
    auth_mod.auth_service._ensure_dbs()

    settings.STORAGE_DIR = test_storage
    settings.UPLOADS_DIR = test_uploads
    settings.GUIDELINES_DIR = test_guidelines

    yield

    shutil.rmtree(temp_dir, ignore_errors=True)

    brand_service.db_path = orig_brand_db
    inspection_service.db_path = orig_insp_db
    auth_mod.USERS_DB_PATH = orig_users_path
    auth_mod.REVOKED_SESSIONS_PATH = orig_revoked_path
    settings.STORAGE_DIR = orig_storage_dir
    settings.UPLOADS_DIR = orig_uploads_dir
    settings.GUIDELINES_DIR = orig_guidelines_dir

import os
import sys
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import app
from backend.app.core.auth import auth_service, UserRole
from backend.app.core.config import settings
from backend.app.core.security import inspect_file_magic_bytes

client = TestClient(app)

class ComprehensiveSecurityAuditSuite(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        def get_or_create(email, password, role, org_id):
            clean_email = email.strip().lower()
            users = auth_service._load_users()
            for u in users.values():
                if u.get("email") == clean_email:
                    from backend.app.core.auth import UserRecord
                    return UserRecord(**u)
            return auth_service.register_user(email=clean_email, password=password, role=role, org_id=org_id)

        # Register test accounts for two distinct organizations
        # 1. Org Alpha
        cls.alpha_admin_rec = get_or_create(
            email="sec_audit_admin@alpha-corp.io",
            password="SecurePassword2026!",
            role=UserRole.ADMIN,
            org_id="org_alpha"
        )
        cls.alpha_admin_token = auth_service.create_session_token(
            cls.alpha_admin_rec.user_id, "admin", "org_alpha"
        )

        cls.alpha_user_rec = get_or_create(
            email="sec_audit_dev@alpha-corp.io",
            password="SecurePassword2026!",
            role=UserRole.DEVELOPER,
            org_id="org_alpha"
        )
        cls.alpha_user_token = auth_service.create_session_token(
            cls.alpha_user_rec.user_id, "developer", "org_alpha"
        )

        # 2. Org Beta
        cls.beta_admin_rec = get_or_create(
            email="sec_audit_admin@beta-defense.com",
            password="SecurePassword2026!",
            role=UserRole.ADMIN,
            org_id="org_beta"
        )
        cls.beta_admin_token = auth_service.create_session_token(
            cls.beta_admin_rec.user_id, "admin", "org_beta"
        )

        cls.beta_user_rec = get_or_create(
            email="sec_audit_dev@beta-defense.com",
            password="SecurePassword2026!",
            role=UserRole.DEVELOPER,
            org_id="org_beta"
        )
        cls.beta_user_token = auth_service.create_session_token(
            cls.beta_user_rec.user_id, "developer", "org_beta"
        )

    # -------------------------------------------------------------------------
    # 1. Authentication & Session Management
    # -------------------------------------------------------------------------
    def test_01_unauthenticated_request_blocked_from_header_spoofing(self):
        """Unauthenticated client passing X-User-Role: admin must be downgraded to VIEWER."""
        res = client.get("/api/v1/auth/me", headers={
            "X-User-Role": "admin",
            "X-User-Id": "spoofed_attacker",
            "X-Org-Id": "org_beta"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["role"], "viewer", "Unauthenticated request must not be granted admin privileges via headers")

    def test_02_authenticated_session_verified(self):
        """Valid Bearer token must accurately identify the user, role, and organization."""
        res = client.get("/api/v1/auth/me", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["user_id"], self.alpha_user_rec.user_id)
        self.assertEqual(data["role"], "developer")
        self.assertEqual(data["org_id"], "org_alpha")

    def test_03_invalid_bearer_token_rejected(self):
        """Tampered or forged token must be rejected with 401 Unauthorized."""
        res = client.get("/api/v1/auth/me", headers={
            "Authorization": "Bearer forged_user_id|admin|org_beta|9999999999|badsignature"
        })
        self.assertEqual(res.status_code, 401)

    # -------------------------------------------------------------------------
    # 2. Password Handling & DoS Mitigation
    # -------------------------------------------------------------------------
    def test_04_password_min_length_enforcement(self):
        """Passwords shorter than 8 characters must be rejected."""
        res = client.post("/api/v1/auth/register", json={
            "email": "short_pwd@test.com",
            "password": "short",
            "org_id": "org_alpha"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("at least 8 characters", res.json()["detail"])

    def test_05_password_max_length_dos_mitigation(self):
        """Excessively long passwords (>128 chars) must be rejected to prevent PBKDF2 CPU exhaustion."""
        giant_pwd = "A" * 10000
        res = client.post("/api/v1/auth/register", json={
            "email": "dos_pwd@test.com",
            "password": giant_pwd,
            "org_id": "org_alpha"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("maximum allowable length", res.json()["detail"])

    # -------------------------------------------------------------------------
    # 3. Privilege Escalation Prevention
    # -------------------------------------------------------------------------
    def test_06_self_service_admin_registration_forbidden(self):
        """Public visitor attempting to self-register as admin must be blocked with 403 Forbidden."""
        res = client.post("/api/v1/auth/register", json={
            "email": "infiltrator@outside.com",
            "password": "ValidPassword2026!",
            "role": "admin",
            "org_id": "org_beta"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("Administrative accounts cannot be self-registered", res.json()["detail"])

    # -------------------------------------------------------------------------
    # 4. Multi-Tenant Organisation Data Isolation
    # -------------------------------------------------------------------------
    def test_07_cross_tenant_workflow_access_blocked(self):
        """Org Alpha user must NOT be allowed to access Org Beta workflow items."""
        res = client.get("/api/v1/workflow/items?org_id=org_beta", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("Cross-tenant access forbidden", res.json()["detail"])

    def test_08_cross_tenant_knowledge_base_access_blocked(self):
        """Org Alpha user must NOT be allowed to access Org Beta knowledge base."""
        res = client.get("/api/v1/knowledge/items?org_id=org_beta", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("Cross-tenant access forbidden", res.json()["detail"])

    def test_09_cross_tenant_audit_logs_access_blocked(self):
        """Org Alpha user must NOT be allowed to inspect Org Beta audit logs."""
        res = client.get("/api/v1/audit/logs?org_id=org_beta", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 403)

    def test_10_cross_tenant_storage_file_access_blocked(self):
        """Org Alpha user must NOT be allowed to access files stored in Org Beta's tenant sandbox."""
        res = client.get("/api/v1/storage/file?org_id=org_beta&file_id=financial_forecast.pdf", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 403)

    def test_11_own_tenant_access_permitted(self):
        """Org Alpha user CAN access Org Alpha workflow items and knowledge base."""
        res = client.get("/api/v1/workflow/items?org_id=org_alpha", headers={
            "Authorization": f"Bearer {self.alpha_user_token}"
        })
        self.assertEqual(res.status_code, 200)

    # -------------------------------------------------------------------------
    # 5. File Upload & Storage Security
    # -------------------------------------------------------------------------
    def test_12_disallowed_extension_html_blocked(self):
        """Uploading HTML or script files must be strictly blocked by extension blacklist."""
        is_valid, mime, msg = inspect_file_magic_bytes(b"<html><body>test</body></html>", "index.html")
        self.assertFalse(is_valid)
        self.assertIn("forbidden", msg)

    def test_13_svg_with_active_script_blocked(self):
        """Uploading SVG containing active script payloads must be blocked."""
        malicious_svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>'
        is_valid, mime, msg = inspect_file_magic_bytes(malicious_svg, "vector.svg")
        self.assertFalse(is_valid)
        self.assertIn("forbidden active script", msg)

    def test_14_svg_with_event_handler_blocked(self):
        """Uploading SVG with event handlers (onload, onerror) must be blocked."""
        malicious_svg = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="10"/></svg>'
        is_valid, mime, msg = inspect_file_magic_bytes(malicious_svg, "vector.svg")
        self.assertFalse(is_valid)
        self.assertIn("forbidden active script", msg)

    def test_15_unauthenticated_access_to_private_uploads_blocked(self):
        """Direct GET /storage/uploads/{file} without authentication must return 401."""
        test_file = settings.UPLOADS_DIR / "private_client_memo.pdf"
        test_file.write_bytes(b"%PDF-1.4 Mock confidential content")
        try:
            res = client.get("/storage/uploads/private_client_memo.pdf")
            self.assertEqual(res.status_code, 401)
            self.assertIn("Authentication required", res.json()["detail"])
        finally:
            if test_file.exists():
                test_file.unlink()

if __name__ == "__main__":
    unittest.main()

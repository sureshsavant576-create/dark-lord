import os
import sys
import unittest
import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import app
from backend.app.core.auth import auth_service, UserRole as AuthUserRole
from backend.app.core.config import settings
from backend.app.core.security import (
    ConfidentialityLevel,
    UserRole as SecUserRole,
    inspect_file_magic_bytes,
    sanitize_filename,
    get_tenant_storage_path,
)

client = TestClient(app)

class FileUploadAndStorageReliabilitySuite(unittest.TestCase):
    """
    Exhaustive verification of the file upload, storage, retrieval,
    and security pipeline for the Sanket AI SaaS platform.
    """

    @classmethod
    def setUpClass(cls):
        def get_or_create_user(email, password, role, org_id):
            clean_email = email.strip().lower()
            users = auth_service._load_users()
            for u in users.values():
                if u.get("email") == clean_email:
                    from backend.app.core.auth import UserRecord
                    return UserRecord(**u)
            return auth_service.register_user(email=clean_email, password=password, role=role, org_id=org_id)

        # 1. Setup Organization Alpha Users
        cls.alpha_admin = get_or_create_user(
            email="storage_admin@alpha.io",
            password="SecureStoragePass2026!",
            role=AuthUserRole.ADMIN,
            org_id="org_alpha"
        )
        cls.token_alpha_admin = auth_service.create_session_token(cls.alpha_admin.user_id, "admin", "org_alpha")

        cls.alpha_dev = get_or_create_user(
            email="storage_creator@alpha.io",
            password="SecureStoragePass2026!",
            role=AuthUserRole.DEVELOPER,
            org_id="org_alpha"
        )
        cls.token_alpha_creator = auth_service.create_session_token(cls.alpha_dev.user_id, "developer", "org_alpha")

        # 2. Setup Organization Beta Users
        cls.beta_admin = get_or_create_user(
            email="storage_admin@beta.com",
            password="SecureStoragePass2026!",
            role=AuthUserRole.ADMIN,
            org_id="org_beta"
        )
        cls.token_beta_admin = auth_service.create_session_token(cls.beta_admin.user_id, "admin", "org_beta")

        cls.beta_dev = get_or_create_user(
            email="storage_creator@beta.com",
            password="SecureStoragePass2026!",
            role=AuthUserRole.DEVELOPER,
            org_id="org_beta"
        )
        cls.token_beta_creator = auth_service.create_session_token(cls.beta_dev.user_id, "developer", "org_beta")

        # Sample valid byte headers
        cls.png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        cls.jpg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9"
        cls.webp_bytes = b"RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x02\x00\x34\x25"
        cls.pdf_bytes = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n160\n%%EOF"
        cls.txt_bytes = b"Approved Brand Guideline Fact Statement: 99.99% high-availability enterprise cloud."
        cls.json_bytes = b'{"specification": "Brand DNA Standard", "version": "2.4", "status": "APPROVED"}'

    # ------------------------------------------------------------------------
    # 1. VALID IMAGE FORMATS (PNG, JPG, JPEG, WEBP)
    # ------------------------------------------------------------------------
    def test_01_upload_valid_png(self):
        """Verify PNG file uploads, validates magic bytes, and stores safely."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("hero_banner.png", self.png_bytes, "image/png")}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["mime_type"], "image/png")
        self.assertEqual(data["org_id"], "org_alpha")
        self.assertTrue(data["file_id"].endswith(".png"))

    def test_02_upload_valid_jpeg(self):
        """Verify JPG/JPEG file uploads and receives correct MIME identification."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("campaign_poster.jpeg", self.jpg_bytes, "image/jpeg")}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mime_type"], "image/jpeg")
        self.assertTrue(data["file_id"].endswith(".jpeg"))

    def test_03_upload_valid_webp(self):
        """Verify WebP image upload and signature matching (RIFF....WEBP)."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("optimized_graphic.webp", self.webp_bytes, "image/webp")}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mime_type"], "image/webp")
        self.assertTrue(data["file_id"].endswith(".webp"))

    # ------------------------------------------------------------------------
    # 2. DOCUMENT FORMATS (PDF, TEXT, JSON)
    # ------------------------------------------------------------------------
    def test_04_upload_valid_pdf_guideline(self):
        """Verify PDF document uploads with '%PDF-' magic bytes verification."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "CONFIDENTIAL"},
            files={"file": ("Brand_Guidelines_2026.pdf", self.pdf_bytes, "application/pdf")}
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mime_type"], "application/pdf")
        self.assertEqual(data["confidentiality"], "CONFIDENTIAL")

    def test_05_upload_valid_text_and_json(self):
        """Verify clean UTF-8 plain text and JSON specifications upload cleanly."""
        res_txt = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("approved_claims.txt", self.txt_bytes, "text/plain")}
        )
        self.assertEqual(res_txt.status_code, 200)
        self.assertEqual(res_txt.json()["mime_type"], "text/plain")

        res_json = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("brand_palette.json", self.json_bytes, "application/json")}
        )
        self.assertEqual(res_json.status_code, 200)
        self.assertEqual(res_json.json()["mime_type"], "application/json")

    # ------------------------------------------------------------------------
    # 3. EMPTY & CORRUPTED FILES
    # ------------------------------------------------------------------------
    def test_06_reject_empty_file(self):
        """Verify 0-byte empty file uploads are strictly rejected with HTTP 400."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha"},
            files={"file": ("empty_poster.png", b"", "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("File is empty", res.json()["detail"])

    def test_07_reject_corrupted_png_header(self):
        """Verify corrupted PNG headers (garbage binary) are detected and blocked."""
        corrupted_png = b"NOT_A_PNG_HEADER_CORRUPTED_BYTES_1234567890"
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha"},
            files={"file": ("corrupt_logo.png", corrupted_png, "image/png")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Upload rejected", res.json()["detail"])

    def test_08_reject_corrupted_pdf_header(self):
        """Verify corrupted PDF headers missing '%PDF-' are blocked."""
        corrupted_pdf = b"GARBAGE_BINARY_REPRESENTING_CORRUPTED_DOCUMENT"
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha"},
            files={"file": ("corrupt_guide.pdf", corrupted_pdf, "application/pdf")}
        )
        self.assertEqual(res.status_code, 400)

    # ------------------------------------------------------------------------
    # 4. UNSUPPORTED FILE TYPES & EXECUTABLES
    # ------------------------------------------------------------------------
    def test_09_reject_executable_extensions(self):
        """Verify forbidden executable extensions (.exe, .sh, .bat) are blocked."""
        forbidden = ["malware.exe", "deploy.sh", "script.bat", "webshell.php"]
        for fname in forbidden:
            res = client.post(
                "/api/v1/storage/upload",
                headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
                data={"org_id": "org_alpha"},
                files={"file": (fname, b"echo 'attack'", "application/octet-stream")}
            )
            self.assertEqual(res.status_code, 400, f"Expected 400 for {fname}, got {res.status_code}")

    def test_10_reject_masquerading_executable_magic_bytes(self):
        """Verify disguised Windows PE executable header ('MZ') renamed to .png is blocked."""
        pe_executable_masquerade = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha"},
            files={"file": ("cute_kitten.png", pe_executable_masquerade, "image/png")}
        )
        self.assertEqual(res.status_code, 400)

    def test_11_reject_xss_injected_svg(self):
        """Verify SVGs containing script tags or event handlers are blocked."""
        xss_svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert("pwned")</script></svg>'
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha"},
            files={"file": ("exploit.svg", xss_svg, "image/svg+xml")}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("SVG contains forbidden active script", res.json()["detail"])

    # ------------------------------------------------------------------------
    # 5. OVERSIZED FILES
    # ------------------------------------------------------------------------
    def test_12_reject_oversized_file(self):
        """Verify files exceeding MAX_FILE_UPLOAD_BYTES (50MB) are rejected."""
        # Test directly against inspect_file_magic_bytes to avoid allocating 51MB in RAM
        oversized_virtual_len = 51 * 1024 * 1024
        # Create a mock slice of 51MB
        fake_large_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * (50 * 1024 * 1024 + 1024)
        is_valid, mime, msg = inspect_file_magic_bytes(fake_large_bytes, "oversized_graphic.png")
        self.assertFalse(is_valid)
        self.assertIn("exceeds max limit of 50MB", msg)

    # ------------------------------------------------------------------------
    # 6. DUPLICATE UPLOADS & NON-COLLISION
    # ------------------------------------------------------------------------
    def test_13_duplicate_uploads_generate_distinct_uuids(self):
        """Verify identical uploads produce separate UUIDs without overwriting."""
        res1 = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("brand_logo.png", self.png_bytes, "image/png")}
        )
        res2 = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("brand_logo.png", self.png_bytes, "image/png")}
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res2.status_code, 200)

        id1 = res1.json()["file_id"]
        id2 = res2.json()["file_id"]
        self.assertNotEqual(id1, id2, "Duplicate uploads must generate distinct storage identifiers")

        # Verify both exist on disk simultaneously
        tenant_dir = get_tenant_storage_path("org_alpha", subfolder="uploads")
        self.assertTrue((tenant_dir / id1).exists())
        self.assertTrue((tenant_dir / id2).exists())

    # ------------------------------------------------------------------------
    # 7. SPECIAL CHARACTERS & PATH TRAVERSAL IN FILENAMES
    # ------------------------------------------------------------------------
    def test_14_path_traversal_sanitization(self):
        """Verify directory traversal sequence ('../../') is stripped safely."""
        res = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("../../../../etc/passwd.png", self.png_bytes, "image/png")}
        )
        self.assertEqual(res.status_code, 200)
        stored_id = res.json()["file_id"]

        # Ensure stored file is strictly inside the authorized tenant directory
        tenant_dir = get_tenant_storage_path("org_alpha", subfolder="uploads").resolve()
        file_path = (tenant_dir / stored_id).resolve()
        self.assertTrue(file_path.is_relative_to(tenant_dir))

    def test_15_windows_device_names_and_unicode_filenames(self):
        """Verify filenames with unicode and Windows reserved names (CON, NUL) sanitize cleanly."""
        safe_unicode = sanitize_filename("Schöne_Grafik_über_Cloud.png")
        self.assertEqual(safe_unicode, "Schöne_Grafik_über_Cloud.png")

        safe_con = sanitize_filename("CON.png")
        self.assertEqual(safe_con, "safe_CON.png")

        safe_nul = sanitize_filename("NUL.jpg")
        self.assertEqual(safe_nul, "safe_NUL.jpg")

    # ------------------------------------------------------------------------
    # 8. CONCURRENT / MULTIPLE UPLOADS
    # ------------------------------------------------------------------------
    def test_16_concurrent_uploads_thread_safety(self):
        """Verify concurrent simultaneous uploads across threads do not crash or corrupt storage."""
        def upload_asset(index):
            return client.post(
                "/api/v1/storage/upload",
                headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
                data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
                files={"file": (f"concurrent_test_{index}.png", self.png_bytes, "image/png")}
            )

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(upload_asset, i) for i in range(10)]
            results = [f.result() for f in futures]

        for r in results:
            self.assertEqual(r.status_code, 200)

        # Confirm all 10 distinct files were saved
        file_ids = {r.json()["file_id"] for r in results}
        self.assertEqual(len(file_ids), 10, "All 10 concurrent uploads must yield distinct file IDs")

    # ------------------------------------------------------------------------
    # 9. FILE RETRIEVAL & INTEGRITY AFTER REFRESH
    # ------------------------------------------------------------------------
    def test_17_file_retrieval_integrity(self):
        """Verify uploaded file retrieval matches exact binary payload and SHA-256 hash."""
        # 1. Upload
        res_upload = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "INTERNAL"},
            files={"file": ("integrity_check.png", self.png_bytes, "image/png")}
        )
        self.assertEqual(res_upload.status_code, 200)
        file_id = res_upload.json()["file_id"]

        # 2. Retrieve via secure storage endpoint
        res_get = client.get(
            f"/api/v1/storage/file?org_id=org_alpha&file_id={file_id}&confidentiality=INTERNAL",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"}
        )
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(hashlib.sha256(res_get.content).hexdigest(), hashlib.sha256(self.png_bytes).hexdigest())

    # ------------------------------------------------------------------------
    # 10. MULTI-TENANT ISOLATION (CROSS-ORG BOUNDARY)
    # ------------------------------------------------------------------------
    def test_18_cross_tenant_access_blocked(self):
        """Verify Organization Beta user is strictly blocked from accessing Org Alpha files."""
        # 1. Org Alpha uploads sensitive document
        res_upload = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "CONFIDENTIAL"},
            files={"file": ("alpha_secret_guidelines.pdf", self.pdf_bytes, "application/pdf")}
        )
        file_id = res_upload.json()["file_id"]

        # 2. Org Beta Creator attempts to download Alpha's document -> 403 Forbidden
        res_breach = client.get(
            f"/api/v1/storage/file?org_id=org_alpha&file_id={file_id}&confidentiality=CONFIDENTIAL",
            headers={"Authorization": f"Bearer {self.token_beta_creator}"}
        )
        self.assertEqual(res_breach.status_code, 403)
        self.assertIn("forbidden", res_breach.json()["detail"].lower())

    # ------------------------------------------------------------------------
    # 11. ROLE-BASED CONFIDENTIALITY CLEARANCE ENFORCEMENT
    # ------------------------------------------------------------------------
    def test_19_role_confidentiality_clearances(self):
        """Verify role clearances (Creator, Manager, Authorised Reviewer, Administrator)."""
        # Upload RESTRICTED document to Org Alpha
        res_upload = client.post(
            "/api/v1/storage/upload",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"},
            data={"org_id": "org_alpha", "confidentiality": "RESTRICTED"},
            files={"file": ("unreleased_rebrand_deck.pdf", self.pdf_bytes, "application/pdf")}
        )
        file_id = res_upload.json()["file_id"]

        # Creator role attempting to access RESTRICTED document -> 403 Forbidden
        res_creator = client.get(
            f"/api/v1/storage/file?org_id=org_alpha&file_id={file_id}&user_role=Creator&confidentiality=RESTRICTED",
            headers={"Authorization": f"Bearer {self.token_alpha_creator}"}
        )
        self.assertEqual(res_creator.status_code, 403)
        self.assertIn("lacks clearance", res_creator.json()["detail"])

        # Administrator role accessing RESTRICTED document -> 200 OK
        res_admin = client.get(
            f"/api/v1/storage/file?org_id=org_alpha&file_id={file_id}&user_role=Administrator&confidentiality=RESTRICTED",
            headers={"Authorization": f"Bearer {self.token_alpha_admin}"}
        )
        self.assertEqual(res_admin.status_code, 200)

    # ------------------------------------------------------------------------
    # 12. UNUATHENTICATED ACCESS PREVENTION
    # ------------------------------------------------------------------------
    def test_20_unauthenticated_requests_blocked(self):
        """Verify unauthenticated requests without bearer token are blocked with HTTP 401."""
        res_upload = client.post(
            "/api/v1/storage/upload",
            data={"org_id": "org_alpha"},
            files={"file": ("poster.png", self.png_bytes, "image/png")}
        )
        self.assertEqual(res_upload.status_code, 401)

        res_get = client.get("/api/v1/storage/file?org_id=org_alpha&file_id=some_file.png")
        self.assertEqual(res_get.status_code, 401)

if __name__ == "__main__":
    unittest.main()

import hashlib
import json
import os
import shutil
import tempfile
import time
import unittest
import zipfile
from pathlib import Path

from backend.app.core.backup import BackupService, compute_file_sha256
from backend.app.core.config import settings
from backend.app.core.auth import auth_service, UserRole


class BackupAndRecoveryReadinessSuite(unittest.TestCase):
    """
    Exhaustive empirical test suite for Backup & Disaster Recovery Readiness
    for the Sanket AI SaaS platform.
    """

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.test_root = Path(cls.temp_dir.name)

        cls.data_dir = cls.test_root / "data"
        cls.backup_dir = cls.test_root / "backups"
        cls.restore_dir = cls.test_root / "restored"

        cls.data_dir.mkdir(parents=True, exist_ok=True)
        cls.backup_dir.mkdir(parents=True, exist_ok=True)
        cls.restore_dir.mkdir(parents=True, exist_ok=True)

        # Build mock data structure
        cls.db_dir = cls.data_dir / "db"
        cls.storage_dir = cls.data_dir / "storage"
        cls.uploads_dir = cls.storage_dir / "uploads"
        cls.guidelines_dir = cls.storage_dir / "guidelines"
        cls.tenants_dir = cls.storage_dir / "tenants" / "apex-cloud" / "uploads"

        for p in [cls.db_dir, cls.uploads_dir, cls.guidelines_dir, cls.tenants_dir]:
            p.mkdir(parents=True, exist_ok=True)

        # Seed sample files with known content
        (cls.db_dir / "users.json").write_text('{"user_1": {"email": "test@sanket.ai"}}', encoding="utf-8")
        (cls.db_dir / "brand_knowledge_base.json").write_text('{"item_1": {"title": "Logo Rules"}}', encoding="utf-8")
        (cls.db_dir / "content_reviews.json").write_text('{"rev_1": {"score": 95.0}}', encoding="utf-8")
        
        # Binary assets
        cls.png_payload = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        (cls.uploads_dir / "creative_sample.png").write_bytes(cls.png_payload)
        (cls.tenants_dir / "tenant_poster.png").write_bytes(cls.png_payload)

        # Service instance
        cls.service = BackupService(data_dir=cls.data_dir, backup_dir=cls.backup_dir)

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_01_create_backup_generates_zip_and_manifest(self):
        """Verify backup archive is created with manifest and table counts."""
        res = self.service.create_backup(note="Unit Test Snapshot", max_backups=5)
        self.assertTrue(res["success"])
        self.assertTrue(Path(res["archive_path"]).exists())
        self.assertTrue(Path(res["manifest_path"]).exists())
        self.assertGreater(res["file_count"], 0)
        self.assertGreater(res["total_size_bytes"], 0)
        self.assertIn("users", res["table_record_counts"])

    def test_02_manifest_sha256_checksums(self):
        """Verify every file in archive matches SHA-256 hash in backup_manifest.json."""
        res = self.service.create_backup(note="Checksum Test")
        archive_path = Path(res["archive_path"])

        with zipfile.ZipFile(archive_path, "r") as zf:
            self.assertIn("backup_manifest.json", zf.namelist())
            manifest = json.loads(zf.read("backup_manifest.json").decode("utf-8"))
            checksums = manifest["checksums"]

            for rel_path, expected_hash in checksums.items():
                member_bytes = zf.read(rel_path)
                actual_hash = hashlib.sha256(member_bytes).hexdigest()
                self.assertEqual(actual_hash, expected_hash, f"Hash mismatch for {rel_path}")

    def test_03_verify_backup_integrity_audit(self):
        """Verify backup_service.verify_backup validates an untampered archive."""
        res = self.service.create_backup(note="Verify Test")
        archive_path = Path(res["archive_path"])

        audit = self.service.verify_backup(archive_path)
        self.assertTrue(audit["is_valid"])
        self.assertEqual(len(audit["mismatches"]), 0)
        self.assertEqual(len(audit["missing_files"]), 0)
        self.assertGreater(audit["verified_files"], 0)

    def test_04_tampered_archive_detected(self):
        """Verify tampering with file bytes in an archive causes verification failure."""
        res = self.service.create_backup(note="Tamper Test")
        orig_archive = Path(res["archive_path"])

        # Create tampered archive
        tampered_archive = self.backup_dir / "tampered_backup.zip"
        with zipfile.ZipFile(orig_archive, "r") as zf_in:
            with zipfile.ZipFile(tampered_archive, "w") as zf_out:
                for item in zf_in.namelist():
                    content = zf_in.read(item)
                    if "users.json" in item:
                        content = b'{"tampered": true}'
                    zf_out.writestr(item, content)

        audit = self.service.verify_backup(tampered_archive)
        self.assertFalse(audit["is_valid"])
        self.assertGreater(len(audit["mismatches"]), 0)
        self.assertIn("users.json", audit["mismatches"][0])

    def test_05_missing_manifest_rejected(self):
        """Verify archive without backup_manifest.json is rejected."""
        no_manifest_archive = self.backup_dir / "no_manifest.zip"
        with zipfile.ZipFile(no_manifest_archive, "w") as zf:
            zf.writestr("test.txt", "dummy content")

        audit = self.service.verify_backup(no_manifest_archive)
        self.assertFalse(audit["is_valid"])
        self.assertIn("missing 'backup_manifest.json'", audit["error"])

    def test_06_non_destructive_restore_in_isolated_environment(self):
        """Verify full non-destructive restoration into an isolated destination directory."""
        res = self.service.create_backup(note="Restore Target Test")
        archive_path = Path(res["archive_path"])

        iso_restore = self.restore_dir / "isolated_run"
        restore_res = self.service.restore_backup(archive_path, target_dir=iso_restore)
        self.assertTrue(restore_res["success"])
        self.assertTrue(restore_res["verified"])
        self.assertEqual(restore_res["restored_files"], res["file_count"])

        # Check restored file on disk
        restored_user = json.loads((iso_restore / "db" / "users.json").read_text(encoding="utf-8"))
        self.assertEqual(restored_user["user_1"]["email"], "test@sanket.ai")

    def test_07_backup_rotation_pruning(self):
        """Verify max_backups enforces automated retention policy."""
        rotation_dir = self.test_root / "rotation_test"
        rotation_dir.mkdir(parents=True, exist_ok=True)
        rot_service = BackupService(data_dir=self.data_dir, backup_dir=rotation_dir)

        # Create 5 backups with max_backups=3
        for i in range(5):
            rot_service.create_backup(backup_dir=rotation_dir, note=f"Backup {i}", max_backups=3)
            time.sleep(0.01)

        archives = list(rotation_dir.glob("sanket_backup_*.zip"))
        self.assertEqual(len(archives), 3)

    def test_08_recreate_demo_data_in_empty_directory(self):
        """Verify recreate_demo_data restores users, knowledge items, and sample assets."""
        empty_env = self.test_root / "fresh_demo_env"
        res = self.service.recreate_demo_data(target_data_dir=empty_env)
        self.assertTrue(res["success"])
        self.assertIn("demo_admin", res)

        # Verify demo user in users.json
        users_file = empty_env / "db" / "users.json"
        self.assertTrue(users_file.exists())
        users_data = json.loads(users_file.read_text(encoding="utf-8"))
        has_demo = any(u.get("email") == "demo@sanket.ai" for u in users_data.values())
        self.assertTrue(has_demo)

        # Verify Knowledge Base was seeded
        kb_file = empty_env / "db" / "brand_knowledge_base.json"
        self.assertTrue(kb_file.exists())
        kb_data = json.loads(kb_file.read_text(encoding="utf-8"))
        self.assertGreater(len(kb_data), 0)

    def test_09_demo_judge_credentials_authenticate_after_recreation(self):
        """Verify that demo judge password DemoJudge2026! matches the recreated user hash."""
        empty_env = self.test_root / "fresh_demo_auth_env"
        self.service.recreate_demo_data(target_data_dir=empty_env)

        users_data = json.loads((empty_env / "db" / "users.json").read_text(encoding="utf-8"))
        demo_user = next(u for u in users_data.values() if u.get("email") == "demo@sanket.ai")

        self.assertTrue(auth_service.verify_password("DemoJudge2026!", demo_user["hashed_password"]))

    def test_10_uploaded_tenant_files_restored_intact(self):
        """Verify uploaded tenant assets maintain binary equality upon restoration."""
        res = self.service.create_backup(note="Tenant Upload Recovery Test")
        archive_path = Path(res["archive_path"])

        dest = self.test_root / "tenant_restore_env"
        self.service.restore_backup(archive_path, target_dir=dest)

        restored_img = dest / "storage" / "tenants" / "apex-cloud" / "uploads" / "tenant_poster.png"
        self.assertTrue(restored_img.exists())
        self.assertEqual(restored_img.read_bytes(), self.png_payload)
        self.assertEqual(compute_file_sha256(restored_img), hashlib.sha256(self.png_payload).hexdigest())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations
import hashlib
import json
import logging
import os
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def compute_file_sha256(path: Path) -> str:
    """Computes SHA-256 hash of a file using buffered streaming."""
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class BackupService:
    """
    Enterprise Backup & Disaster Recovery Service for the Sanket AI SaaS platform.
    Manages cryptographic snapshot creation, verification, non-destructive restoration,
    and automatic demo environment recreation.
    """

    def __init__(self, data_dir: Optional[Path] = None, backup_dir: Optional[Path] = None):
        self.data_dir = data_dir or settings.DATA_DIR
        self.backup_dir = backup_dir or settings.BACKUP_DIR
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def _get_target_files(self, base_dir: Path) -> List[Path]:
        """Collects all database and storage assets eligible for backup."""
        eligible_files: List[Path] = []
        target_subdirs = ["db", "storage"]

        for subdir in target_subdirs:
            subpath = base_dir / subdir
            if not subpath.exists():
                continue
            for item in subpath.rglob("*"):
                if item.is_file():
                    # Exclude temporary staging files, locks, and sockets
                    if item.name.endswith(".tmp") or item.name.startswith(".db_connectivity"):
                        continue
                    eligible_files.append(item)
        return eligible_files

    def _count_db_records(self, db_dir: Path) -> Dict[str, int]:
        """Calculates record counts across all JSON database collections."""
        counts: Dict[str, int] = {}
        if not db_dir.exists():
            return counts

        for json_file in db_dir.glob("*.json"):
            try:
                content = json_file.read_text(encoding="utf-8").strip()
                if not content:
                    counts[json_file.stem] = 0
                    continue
                data = json.loads(content)
                if isinstance(data, dict):
                    counts[json_file.stem] = len(data)
                elif isinstance(data, list):
                    counts[json_file.stem] = len(data)
            except Exception:
                counts[json_file.stem] = -1

        # Audit logs count
        audit_dir = db_dir / "audit_logs"
        if audit_dir.exists():
            total_logs = 0
            for log_file in audit_dir.glob("*.jsonl"):
                try:
                    total_logs += sum(1 for line in log_file.read_text(encoding="utf-8").splitlines() if line.strip())
                except Exception:
                    pass
            counts["audit_logs_total_events"] = total_logs

        return counts

    def create_backup(
        self,
        backup_dir: Optional[Path] = None,
        note: str = "Automated production backup",
        max_backups: int = 7
    ) -> Dict[str, Any]:
        """
        Creates a compressed, cryptographic SHA-256 verified archive containing all
        database collections, audit logs, tenant assets, and guidelines.
        """
        target_backup_dir = backup_dir or self.backup_dir
        target_backup_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_uuid = hashlib.sha256(f"{timestamp_str}_{os.urandom(8)}".encode()).hexdigest()[:8]
        archive_name = f"sanket_backup_{timestamp_str}_{backup_uuid}.zip"
        archive_path = target_backup_dir / archive_name
        manifest_path = target_backup_dir / f"sanket_backup_{timestamp_str}_{backup_uuid}_manifest.json"

        files_to_backup = self._get_target_files(self.data_dir)
        checksums: Dict[str, str] = {}
        total_size = 0

        # Create temporary zip archive
        tmp_archive = archive_path.with_suffix(".tmp")
        with zipfile.ZipFile(tmp_archive, "w", zipfile.ZIP_DEFLATED) as zip_out:
            for file_path in files_to_backup:
                rel_path = file_path.relative_to(self.data_dir).as_posix()
                file_hash = compute_file_sha256(file_path)
                checksums[rel_path] = file_hash
                total_size += file_path.stat().st_size
                zip_out.write(file_path, arcname=rel_path)

            # Build Manifest
            manifest = {
                "backup_id": f"bk_{timestamp_str}_{backup_uuid}",
                "archive_filename": archive_name,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "file_count": len(files_to_backup),
                "total_size_bytes": total_size,
                "note": note,
                "schema_version": "2.0",
                "table_record_counts": self._count_db_records(self.data_dir / "db"),
                "checksums": checksums,
            }

            # Pack manifest inside archive root
            manifest_json = json.dumps(manifest, indent=2)
            zip_out.writestr("backup_manifest.json", manifest_json)

        # Atomic finalize
        tmp_archive.replace(archive_path)

        # Save companion manifest file for fast inspection without unzipping
        manifest_path.write_text(manifest_json, encoding="utf-8")

        # Compute archive checksum
        archive_sha256 = compute_file_sha256(archive_path)

        # Prune old backups if count exceeds max_backups
        self._prune_old_backups(target_backup_dir, max_backups)

        logger.info("Successfully generated backup archive '%s' (%d files, %d bytes)", archive_name, len(files_to_backup), total_size)
        return {
            "success": True,
            "backup_id": manifest["backup_id"],
            "archive_path": str(archive_path),
            "manifest_path": str(manifest_path),
            "file_count": len(files_to_backup),
            "total_size_bytes": total_size,
            "archive_sha256": archive_sha256,
            "created_at": manifest["created_at"],
            "table_record_counts": manifest["table_record_counts"]
        }

    def _prune_old_backups(self, backup_dir: Path, max_backups: int) -> None:
        """Retains the most recent N backups, pruning older archives and manifests."""
        try:
            archives = sorted(
                backup_dir.glob("sanket_backup_*.zip"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if len(archives) > max_backups:
                for stale in archives[max_backups:]:
                    companion_manifest = stale.with_name(stale.stem + "_manifest.json")
                    if companion_manifest.exists():
                        companion_manifest.unlink()
                    stale.unlink()
                    logger.info("Pruned old backup archive: %s", stale.name)
        except Exception as exc:
            logger.warning("Failed to prune old backups: %s", exc)

    def verify_backup(self, archive_path: Path) -> Dict[str, Any]:
        """
        Adversarial integrity audit of a backup archive.
        Verifies zip structure and matches every archived member against the declared SHA-256 hash.
        """
        if not archive_path.exists():
            return {
                "is_valid": False,
                "error": f"Backup archive does not exist: {archive_path}"
            }

        if not zipfile.is_zipfile(archive_path):
            return {
                "is_valid": False,
                "error": "File is corrupted or not a valid zip archive."
            }

        try:
            with zipfile.ZipFile(archive_path, "r") as zf:
                # 1. Check for manifest
                if "backup_manifest.json" not in zf.namelist():
                    return {
                        "is_valid": False,
                        "error": "Archive missing 'backup_manifest.json'."
                    }

                manifest_data = json.loads(zf.read("backup_manifest.json").decode("utf-8"))
                declared_checksums = manifest_data.get("checksums", {})

                mismatches: List[str] = []
                missing_files: List[str] = []
                verified_count = 0

                # 2. Verify all checksums
                for rel_path, expected_hash in declared_checksums.items():
                    if rel_path not in zf.namelist():
                        missing_files.append(rel_path)
                        continue
                    member_bytes = zf.read(rel_path)
                    actual_hash = hashlib.sha256(member_bytes).hexdigest()
                    if actual_hash != expected_hash:
                        mismatches.append(f"{rel_path} (expected {expected_hash}, got {actual_hash})")
                    else:
                        verified_count += 1

                is_valid = len(mismatches) == 0 and len(missing_files) == 0
                return {
                    "is_valid": is_valid,
                    "backup_id": manifest_data.get("backup_id"),
                    "created_at": manifest_data.get("created_at"),
                    "verified_files": verified_count,
                    "total_declared": len(declared_checksums),
                    "mismatches": mismatches,
                    "missing_files": missing_files,
                    "table_record_counts": manifest_data.get("table_record_counts", {})
                }
        except Exception as exc:
            return {
                "is_valid": False,
                "error": f"Verification failed with exception: {str(exc)}"
            }

    def restore_backup(
        self,
        archive_path: Path,
        target_dir: Optional[Path] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Safely restores database collections and storage files from a validated archive.
        Verifies checksums prior to extraction and re-checks files on disk post-extraction.
        """
        destination = target_dir or self.data_dir
        destination.mkdir(parents=True, exist_ok=True)

        # 1. Pre-restoration integrity verification
        verification = self.verify_backup(archive_path)
        if not verification.get("is_valid") and not force:
            raise ValueError(f"Aborting restore: Archive integrity check failed: {verification.get('error') or verification.get('mismatches')}")

        restored_files: List[str] = []
        with zipfile.ZipFile(archive_path, "r") as zf:
            manifest_data = json.loads(zf.read("backup_manifest.json").decode("utf-8"))
            declared_checksums = manifest_data.get("checksums", {})

            for rel_path in declared_checksums.keys():
                dest_file = destination / rel_path
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                dest_tmp = dest_file.with_suffix(".tmp")
                dest_tmp.write_bytes(zf.read(rel_path))
                dest_tmp.replace(dest_file)
                restored_files.append(rel_path)

        # 2. Post-restoration verification
        post_mismatches = []
        for rel_path, expected_hash in declared_checksums.items():
            actual_on_disk = compute_file_sha256(destination / rel_path)
            if actual_on_disk != expected_hash:
                post_mismatches.append(rel_path)

        if post_mismatches:
            raise RuntimeError(f"Post-restore checksum verification failed on {len(post_mismatches)} files.")

        logger.info("Restore completed successfully into '%s': %d files restored.", destination, len(restored_files))
        return {
            "success": True,
            "backup_id": manifest_data.get("backup_id"),
            "target_dir": str(destination),
            "restored_files": len(restored_files),
            "verified": True,
            "table_record_counts": manifest_data.get("table_record_counts", {})
        }

    def recreate_demo_data(self, target_data_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Programmatically recreates all demo accounts, brand knowledge, reviews,
        and workflow items in an empty or fresh environment.
        """
        data_root = target_data_dir or self.data_dir
        db_dir = data_root / "db"
        storage_dir = data_root / "storage"
        uploads_dir = storage_dir / "uploads"
        guidelines_dir = storage_dir / "guidelines"
        tenants_dir = storage_dir / "tenants"

        for p in [db_dir, uploads_dir, guidelines_dir, tenants_dir]:
            p.mkdir(parents=True, exist_ok=True)

        results: Dict[str, Any] = {}

        # 1. Recreate Demo Administrator Account
        users_file = db_dir / "users.json"
        users_data = {}
        if users_file.exists():
            try:
                users_data = json.loads(users_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        demo_email = "demo@sanket.ai"
        if not any(u.get("email") == demo_email for u in users_data.values()):
            user_id = f"user_{hashlib.sha256(demo_email.encode()).hexdigest()[:10]}"
            # Standard pbkdf2 hash for DemoJudge2026!
            salt = b"sanket_demo_salt"
            key = hashlib.pbkdf2_hmac("sha256", "DemoJudge2026!".encode("utf-8"), salt, 100_000)
            hashed = f"{salt.hex()}:{key.hex()}"
            users_data[user_id] = {
                "user_id": user_id,
                "email": demo_email,
                "hashed_password": hashed,
                "role": "admin",
                "org_id": "apex-cloud",
                "created_at": time.time()
            }
            users_file.write_text(json.dumps(users_data, indent=2), encoding="utf-8")
            results["demo_admin"] = "demo@sanket.ai (Admin in apex-cloud)"

        # 2. Recreate Certified Enterprise Knowledge Base
        from backend.app.services.knowledge_service import knowledge_service
        prev_kb_path = knowledge_service.db_path
        prev_hist_path = knowledge_service.history_path
        knowledge_service.db_path = db_dir / "brand_knowledge_base.json"
        knowledge_service.history_path = db_dir / "brand_knowledge_history.json"
        knowledge_service._ensure_storage()
        try:
            seeded_kb = knowledge_service.seed_enterprise_knowledge_base("apex-cloud", "apex-cloud")
            results["knowledge_items_seeded"] = seeded_kb
        finally:
            knowledge_service.db_path = prev_kb_path
            knowledge_service.history_path = prev_hist_path

        # 3. Recreate Departmental Review History
        from backend.app.services.content_review_service import content_review_service
        from backend.app.services.brand_insights_service import brand_insights_service
        prev_rev_path = content_review_service.db_path
        content_review_service.db_path = db_dir / "content_reviews.json"
        content_review_service.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not content_review_service.db_path.exists():
            content_review_service.db_path.write_text("{}", encoding="utf-8")
        try:
            brand_insights_service._ensure_seed_history()
            rev_file = db_dir / "content_reviews.json"
            if rev_file.exists():
                rev_content = json.loads(rev_file.read_text(encoding="utf-8"))
                results["reviews_seeded"] = len(rev_content)
        finally:
            content_review_service.db_path = prev_rev_path

        # 4. Recreate Default Brand Profiles
        from backend.app.services.brand_service import brand_service
        from backend.app.models.brand import BrandProfile
        prev_brand_path = brand_service.db_path
        brand_service.db_path = db_dir / "brand_profiles.json"
        brand_service._ensure_db()
        try:
            if not (db_dir / "brand_profiles.json").exists() or (db_dir / "brand_profiles.json").read_text(encoding="utf-8").strip() in ("", "{}"):
                apex_profile = BrandProfile(
                    brand_id="apex-cloud",
                    brand_name="Apex Cloud",
                    approved_palette=["#0052CC", "#00D2D3", "#0F172A", "#FFFFFF"],
                    disallowed_elements=["guaranteed", "100% bug-free", "cheap", "unlimited"],
                    logo_url="/static/samples/logo_shield.png",
                    updated_at=datetime.now(timezone.utc).isoformat()
                )
                brand_service.save_brand_profile(apex_profile)
                results["brand_profiles_seeded"] = 1
        finally:
            brand_service.db_path = prev_brand_path

        # 5. Recreate Sample Static Assets
        static_samples = settings.STATIC_DIR / "samples"
        seeded_assets = 0
        if static_samples.exists():
            for sample_img in static_samples.glob("*.png"):
                dest = uploads_dir / sample_img.name
                if not dest.exists():
                    shutil.copy2(sample_img, dest)
                    seeded_assets += 1
        results["sample_assets_restored"] = seeded_assets

        results["success"] = True
        return results

    def list_backups(self, backup_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
        """Lists available backup archives with their metadata."""
        target_dir = backup_dir or self.backup_dir
        backups: List[Dict[str, Any]] = []

        for archive in sorted(target_dir.glob("sanket_backup_*.zip"), key=lambda p: p.stat().st_mtime, reverse=True):
            manifest_file = archive.with_name(archive.stem + "_manifest.json")
            item = {
                "filename": archive.name,
                "path": str(archive),
                "size_bytes": archive.stat().st_size,
                "modified_at": datetime.fromtimestamp(archive.stat().st_mtime, tz=timezone.utc).isoformat(),
            }
            if manifest_file.exists():
                try:
                    data = json.loads(manifest_file.read_text(encoding="utf-8"))
                    item.update({
                        "backup_id": data.get("backup_id"),
                        "created_at": data.get("created_at"),
                        "file_count": data.get("file_count"),
                        "note": data.get("note"),
                        "table_record_counts": data.get("table_record_counts", {})
                    })
                except Exception:
                    pass
            backups.append(item)
        return backups


backup_service = BackupService()

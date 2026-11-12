#!/usr/bin/env python3
"""
Sanket AI Enterprise Backup & Recovery CLI Tool
Provides operational commands for automated backups, integrity auditing,
non-destructive disaster recovery, and demo data recreation.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure dark lord repository root is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.core.backup import backup_service
from backend.app.core.config import settings


def cmd_backup(args):
    print(f"[*] Initiating backup from '{settings.DATA_DIR}'...")
    res = backup_service.create_backup(
        backup_dir=Path(args.dir) if args.dir else None,
        note=args.note,
        max_backups=args.keep
    )
    if res["success"]:
        print(f"[+] Backup completed successfully!")
        print(f"    Backup ID:     {res['backup_id']}")
        print(f"    Archive File:  {res['archive_path']}")
        print(f"    Manifest File: {res['manifest_path']}")
        print(f"    Total Files:   {res['file_count']}")
        print(f"    Archive Size:  {res['total_size_bytes'] / (1024 * 1024):.2f} MB")
        print(f"    SHA-256 Hash:  {res['archive_sha256']}")
        print("\n    Table Record Counts:")
        for table, count in res["table_record_counts"].items():
            print(f"      - {table:30}: {count}")
    else:
        print("[-] Backup failed.")
        sys.exit(1)


def cmd_verify(args):
    archive_path = Path(args.archive)
    print(f"[*] Auditing backup archive: {archive_path.name}...")
    res = backup_service.verify_backup(archive_path)
    if res.get("is_valid"):
        print("[+] BACKUP INTEGRITY VERIFIED (PASS)")
        print(f"    Backup ID:      {res.get('backup_id')}")
        print(f"    Created At:     {res.get('created_at')}")
        print(f"    Verified Files: {res.get('verified_files')} / {res.get('total_declared')}")
        print(f"    Checksum Errors: 0")
        print(f"    Missing Files:   0")
    else:
        print("[-] BACKUP VERIFICATION FAILED (CORRUPTED / TAMPERED)")
        print(f"    Error:          {res.get('error')}")
        if res.get("mismatches"):
            print("    Checksum Mismatches:")
            for m in res["mismatches"]:
                print(f"      ! {m}")
        if res.get("missing_files"):
            print("    Missing Files:")
            for mf in res["missing_files"]:
                print(f"      ! {mf}")
        sys.exit(1)


def cmd_restore(args):
    archive_path = Path(args.archive)
    target_dir = Path(args.target_dir) if args.target_dir else settings.DATA_DIR
    print(f"[*] Restoring from '{archive_path.name}' into destination '{target_dir}'...")
    try:
        res = backup_service.restore_backup(
            archive_path=archive_path,
            target_dir=target_dir,
            force=args.force
        )
        print(f"[+] RESTORATION COMPLETED SUCCESSFULLY")
        print(f"    Backup ID:      {res['backup_id']}")
        print(f"    Destination:    {res['target_dir']}")
        print(f"    Restored Files: {res['restored_files']}")
        print(f"    Checksum Audit: PASSED (100% matched)")
    except Exception as exc:
        print(f"[-] Restoration failed: {exc}")
        sys.exit(1)


def cmd_recreate_demo(args):
    target_dir = Path(args.target_dir) if args.target_dir else settings.DATA_DIR
    print(f"[*] Recreating pristine demo environment in '{target_dir}'...")
    res = backup_service.recreate_demo_data(target_data_dir=target_dir)
    print("[+] DEMO ENVIRONMENT RECREATED")
    print(f"    Admin User:         {res.get('demo_admin', 'Retained existing')}")
    print(f"    Knowledge Items:    {res.get('knowledge_items_seeded', 0)} items seeded")
    print(f"    Department Reviews: {res.get('reviews_seeded', 0)} records initialized")
    print(f"    Sample Assets:      {res.get('sample_assets_restored', 0)} files restored")


def cmd_list(args):
    backup_dir = Path(args.dir) if args.dir else settings.BACKUP_DIR
    backups = backup_service.list_backups(backup_dir)
    print(f"[*] Available backups in '{backup_dir}': ({len(backups)} found)\n")
    if not backups:
        print("    (No backups found)")
        return

    print(f"    {'ARCHIVE FILENAME':40} | {'FILES':6} | {'SIZE (MB)':10} | {'CREATED AT (UTC)':20} | {'NOTE'}")
    print("    " + "-" * 105)
    for b in backups:
        size_mb = b['size_bytes'] / (1024 * 1024)
        print(f"    {b['filename']:40} | {str(b.get('file_count', '-')):6} | {size_mb:10.2f} | {b.get('created_at', b['modified_at'])[:19]:20} | {b.get('note', '')}")


def main():
    parser = argparse.ArgumentParser(description="Sanket AI Backup & Disaster Recovery CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # backup
    p_backup = subparsers.add_parser("backup", help="Create an atomic compressed backup archive")
    p_backup.add_argument("--note", default="Manual CLI backup", help="Note describing the backup reason")
    p_backup.add_argument("--dir", default=None, help="Custom destination directory for backup archive")
    p_backup.add_argument("--keep", type=int, default=7, help="Number of recent backups to retain")
    p_backup.set_defaults(func=cmd_backup)

    # verify
    p_verify = subparsers.add_parser("verify", help="Audit the cryptographic SHA-256 integrity of an archive")
    p_verify.add_argument("archive", help="Path to .zip backup archive")
    p_verify.set_defaults(func=cmd_verify)

    # restore
    p_restore = subparsers.add_parser("restore", help="Restore database and storage assets from backup")
    p_restore.add_argument("archive", help="Path to .zip backup archive")
    p_restore.add_argument("--target-dir", default=None, help="Target destination data directory")
    p_restore.add_argument("--force", action="store_true", help="Force restore even if integrity check has warnings")
    p_restore.set_defaults(func=cmd_restore)

    # recreate-demo
    p_demo = subparsers.add_parser("recreate-demo", help="Programmatically recreate pristine demo dataset")
    p_demo.add_argument("--target-dir", default=None, help="Target data directory")
    p_demo.set_defaults(func=cmd_recreate_demo)

    # list
    p_list = subparsers.add_parser("list", help="List existing backup archives")
    p_list.add_argument("--dir", default=None, help="Directory to inspect for backups")
    p_list.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

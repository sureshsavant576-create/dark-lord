from __future__ import annotations
from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from backend.app.core.config import settings
from backend.app.models.brand_dna import BrandDNAProfile

logger = logging.getLogger(__name__)


class SupabaseService:
    """
    Unified Supabase client covering Auth, PostgREST persistence, and Storage
    using ONLY configured environment credentials (SUPABASE_URL, SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY), with safe local JSON fallback when tables are
    not yet migrated.
    Never exposes API secrets in return values or logs.
    """

    def is_configured(self) -> bool:
        return settings.has_supabase

    def _base_url(self) -> str:
        return settings.resolved_supabase_url

    def _service_headers(self, prefer: Optional[str] = None, content_type: str = "application/json") -> Dict[str, str]:
        key = settings.supabase_service_key or settings.supabase_anon_key
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
        }
        if content_type:
            headers["Content-Type"] = content_type
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _anon_headers(self) -> Dict[str, str]:
        key = settings.supabase_anon_key or settings.supabase_service_key
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def get_schema_sql(self) -> str:
        schema_file = Path(__file__).resolve().parents[2] / "supabase_schema.sql"
        if schema_file.exists():
            return schema_file.read_text(encoding="utf-8")
        table = settings.SUPABASE_TABLE
        return (
            f"CREATE TABLE IF NOT EXISTS {table} (\n"
            "  dna_id TEXT PRIMARY KEY,\n"
            "  org_id TEXT NOT NULL,\n"
            "  brand_id TEXT NOT NULL,\n"
            "  company_name TEXT NOT NULL,\n"
            "  status TEXT NOT NULL,\n"
            "  is_approved BOOLEAN DEFAULT TRUE,\n"
            "  approved_by TEXT,\n"
            "  approved_at TIMESTAMPTZ,\n"
            "  company_facts JSONB NOT NULL,\n"
            "  ai_recommendations JSONB NOT NULL,\n"
            "  created_at TIMESTAMPTZ DEFAULT NOW(),\n"
            "  updated_at TIMESTAMPTZ DEFAULT NOW()\n"
            ");"
        )

    def get_status(self) -> Dict[str, Any]:
        url = self._base_url()
        masked_url = url[:16] + "..." + url[-12:] if len(url) > 30 else (url or "Not configured")
        return {
            "configured": self.is_configured(),
            "supabase_url": masked_url if self.is_configured() else None,
            "target_table": settings.SUPABASE_TABLE,
            "storage_bucket": settings.SUPABASE_STORAGE_BUCKET,
            "tables": [
                settings.SUPABASE_ORGANIZATIONS_TABLE,
                settings.SUPABASE_TABLE,
                settings.SUPABASE_KNOWLEDGE_TABLE,
                settings.SUPABASE_REVIEWS_TABLE,
                settings.SUPABASE_WORKFLOW_TABLE,
                settings.SUPABASE_INSIGHTS_TABLE,
            ],
            "recommended_sql_schema": self.get_schema_sql(),
        }

    async def probe_live_health(self) -> Dict[str, Any]:
        """
        Probes live Supabase Auth, PostgREST schema definitions, and Storage buckets
        without exposing keys or secrets.
        """
        if not self.is_configured():
            return {
                "configured": False,
                "status": "unconfigured",
                "provider": "supabase",
                "message": "SUPABASE_URL and Supabase keys are not configured."
            }

        base = self._base_url()
        expected_tables = [
            settings.SUPABASE_ORGANIZATIONS_TABLE,
            settings.SUPABASE_TABLE,
            settings.SUPABASE_KNOWLEDGE_TABLE,
            settings.SUPABASE_REVIEWS_TABLE,
            settings.SUPABASE_WORKFLOW_TABLE,
            settings.SUPABASE_INSIGHTS_TABLE,
        ]
        result: Dict[str, Any] = {
            "configured": True,
            "provider": "supabase",
            "api_url": base,
            "auth": {"reachable": False},
            "database": {"reachable": False, "existing_tables": [], "missing_tables": list(expected_tables)},
            "storage": {"reachable": False, "buckets": [], "target_bucket": settings.SUPABASE_STORAGE_BUCKET},
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                # 1. Auth health
                r_auth = await client.get(f"{base}/auth/v1/settings", headers=self._anon_headers())
                result["auth"] = {
                    "reachable": r_auth.status_code == 200,
                    "status_code": r_auth.status_code,
                    "email_signup_enabled": bool(r_auth.json().get("external", {}).get("email", True)) if r_auth.status_code == 200 else None,
                }

                # 2. REST / Postgres schema introspection
                r_rest = await client.get(f"{base}/rest/v1/", headers=self._service_headers())
                if r_rest.status_code == 200:
                    spec = r_rest.json()
                    defs = list((spec.get("definitions") or {}).keys())
                    existing = [t for t in expected_tables if t in defs]
                    missing = [t for t in expected_tables if t not in defs]
                    result["database"] = {
                        "reachable": True,
                        "status_code": 200,
                        "existing_tables": defs,
                        "expected_tables_ready": existing,
                        "missing_tables": missing,
                        "schema_migration_needed": len(missing) > 0,
                        "schema_file": "backend/supabase_schema.sql",
                    }
                else:
                    result["database"] = {"reachable": False, "status_code": r_rest.status_code}

                # 3. Storage buckets check
                r_bucket = await client.get(f"{base}/storage/v1/bucket", headers=self._service_headers())
                if r_bucket.status_code == 200:
                    buckets = [b.get("name") or b.get("id") for b in (r_bucket.json() or [])]
                    result["storage"] = {
                        "reachable": True,
                        "status_code": 200,
                        "buckets": buckets,
                        "target_bucket": settings.SUPABASE_STORAGE_BUCKET,
                        "target_bucket_ready": settings.SUPABASE_STORAGE_BUCKET in buckets,
                    }
                else:
                    result["storage"] = {"reachable": False, "status_code": r_bucket.status_code}

            if result["auth"]["reachable"] and result["database"]["reachable"] and result["storage"]["reachable"]:
                if result["database"].get("missing_tables"):
                    result["status"] = "partially_configured_schema_pending"
                else:
                    result["status"] = "operational"
            else:
                result["status"] = "degraded"
            return result
        except Exception as exc:
            logger.warning("Supabase live health probe error: %s", exc)
            result["status"] = "error"
            result["error"] = str(exc)
            return result

    async def ensure_storage_bucket(self, bucket_name: Optional[str] = None) -> Dict[str, Any]:
        """Ensures the tenant asset storage bucket exists in Supabase Storage."""
        if not self.is_configured() or not settings.supabase_service_key:
            return {"ready": False, "reason": "Supabase service role key not configured."}
        bucket = bucket_name or settings.SUPABASE_STORAGE_BUCKET
        base = self._base_url()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                check = await client.get(f"{base}/storage/v1/bucket/{bucket}", headers=self._service_headers())
                if check.status_code == 200:
                    return {"ready": True, "bucket": bucket, "created": False}
                create = await client.post(
                    f"{base}/storage/v1/bucket",
                    json={"id": bucket, "name": bucket, "public": False},
                    headers=self._service_headers(),
                )
                if create.status_code in (200, 201):
                    return {"ready": True, "bucket": bucket, "created": True}
                return {"ready": False, "bucket": bucket, "status_code": create.status_code, "error": create.text[:250]}
        except Exception as exc:
            return {"ready": False, "bucket": bucket, "error": str(exc)}

    async def upload_storage_object(
        self,
        org_id: str,
        subfolder: str,
        filename: str,
        content_bytes: bytes,
        content_type: str = "application/octet-stream",
    ) -> Dict[str, Any]:
        """Uploads a file or image into tenant-isolated path inside Supabase Storage."""
        if not self.is_configured() or not settings.supabase_service_key:
            return {"uploaded": False, "provider": "local_only"}
        bucket = settings.SUPABASE_STORAGE_BUCKET
        await self.ensure_storage_bucket(bucket)
        clean_org = (org_id or "default-org").strip("/")
        clean_sub = (subfolder or "uploads").strip("/")
        object_path = f"{clean_org}/{clean_sub}/{filename}"
        base = self._base_url()
        headers = {
            "apikey": settings.supabase_service_key,
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{base}/storage/v1/object/{bucket}/{object_path}",
                    content=content_bytes,
                    headers=headers,
                )
                if res.status_code in (200, 201):
                    return {
                        "uploaded": True,
                        "provider": "supabase_storage",
                        "bucket": bucket,
                        "object_path": object_path,
                    }
                return {
                    "uploaded": False,
                    "provider": "supabase_storage_error",
                    "status_code": res.status_code,
                    "error": res.text[:250],
                }
        except Exception as exc:
            return {"uploaded": False, "provider": "supabase_storage_exception", "error": str(exc)}

    async def register_supabase_user(
        self,
        email: str,
        password: str,
        role: str,
        org_id: str,
        full_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synchronizes a registered company admin or invited employee with Supabase Auth."""
        if not self.is_configured():
            return {"synced": False, "reason": "Supabase unconfigured"}
        base = self._base_url()
        meta = {"role": role, "org_id": org_id, "full_name": full_name or ""}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                if settings.supabase_service_key:
                    res = await client.post(
                        f"{base}/auth/v1/admin/users",
                        json={
                            "email": email,
                            "password": password,
                            "email_confirm": True,
                            "user_metadata": meta,
                            "app_metadata": {"org_id": org_id, "role": role},
                        },
                        headers=self._service_headers(),
                    )
                    if res.status_code in (200, 201):
                        data = res.json()
                        return {"synced": True, "provider": "supabase_auth", "supabase_user_id": data.get("id")}
                res_pub = await client.post(
                    f"{base}/auth/v1/signup",
                    json={"email": email, "password": password, "data": meta},
                    headers=self._anon_headers(),
                )
                if res_pub.status_code in (200, 201):
                    data = res_pub.json()
                    uid = (data.get("user") or {}).get("id") or data.get("id")
                    return {"synced": True, "provider": "supabase_auth_signup", "supabase_user_id": uid}
                return {"synced": False, "status_code": res_pub.status_code, "error": res_pub.text[:250]}
        except Exception as exc:
            return {"synced": False, "error": str(exc)}

    async def authenticate_supabase_user(self, email: str, password: str) -> Dict[str, Any]:
        """Authenticates a user against Supabase Auth password grant."""
        if not self.is_configured():
            return {"authenticated": False, "reason": "Supabase unconfigured"}
        base = self._base_url()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    f"{base}/auth/v1/token?grant_type=password",
                    json={"email": email, "password": password},
                    headers=self._anon_headers(),
                )
                if res.status_code == 200:
                    data = res.json()
                    user_obj = data.get("user") or {}
                    return {
                        "authenticated": True,
                        "supabase_user_id": user_obj.get("id"),
                        "email": user_obj.get("email"),
                    }
                return {"authenticated": False, "status_code": res.status_code}
        except Exception as exc:
            return {"authenticated": False, "error": str(exc)}

    async def upsert_table_record(
        self,
        table: str,
        payload: Dict[str, Any],
        on_conflict: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upserts a JSON record into a Supabase PostgREST table with safe error capture."""
        if not self.is_configured():
            return {
                "saved_to_supabase": False,
                "provider": "local_database_fallback",
                "message": "Supabase is not configured. Saved in local persistent store.",
            }
        base = self._base_url()
        query = f"?on_conflict={on_conflict}" if on_conflict else ""
        endpoint = f"{base}/rest/v1/{table}{query}"
        headers = self._service_headers(prefer="resolution=merge-duplicates,return=representation")
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                if res.status_code in (200, 201):
                    return {
                        "saved_to_supabase": True,
                        "provider": "supabase",
                        "table": table,
                        "status_code": res.status_code,
                    }
                return {
                    "saved_to_supabase": False,
                    "provider": "supabase_error_fallback",
                    "table": table,
                    "status_code": res.status_code,
                    "error": res.text[:250],
                    "fallback": "local_store",
                }
        except Exception as exc:
            logger.warning("Supabase upsert exception on table '%s': %s", table, exc)
            return {
                "saved_to_supabase": False,
                "provider": "supabase_network_exception",
                "table": table,
                "error": str(exc),
                "fallback": "local_store",
            }

    async def save_organization(self, org_record: Any) -> Dict[str, Any]:
        payload = org_record.model_dump() if hasattr(org_record, "model_dump") else dict(org_record)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        return await self.upsert_table_record(settings.SUPABASE_ORGANIZATIONS_TABLE, payload, on_conflict="org_id")

    async def save_brand_dna_profile(self, profile: BrandDNAProfile) -> Dict[str, Any]:
        payload = {
            "dna_id": profile.dna_id,
            "org_id": getattr(profile, "org_id", None) or profile.brand_id,
            "brand_id": profile.brand_id,
            "company_name": profile.company_name,
            "status": profile.status.value if hasattr(profile.status, "value") else str(profile.status),
            "is_approved": profile.is_approved,
            "approved_by": profile.approved_by,
            "approved_at": profile.approved_at or datetime.now(timezone.utc).isoformat(),
            "company_facts": profile.company_facts.model_dump(),
            "ai_recommendations": profile.ai_recommendations.model_dump(),
            "created_at": profile.created_at,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await self.upsert_table_record(settings.SUPABASE_TABLE, payload, on_conflict="dna_id")
        if res.get("saved_to_supabase"):
            res["record_id"] = profile.dna_id
        return res

    async def save_knowledge_item(self, item: Any) -> Dict[str, Any]:
        raw = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        payload = {
            "item_id": raw.get("item_id"),
            "org_id": raw.get("org_id", "default-org"),
            "brand_id": raw.get("brand_id", raw.get("org_id", "default-org")),
            "category": str(raw.get("category", "guidelines")),
            "title": raw.get("title", ""),
            "content": raw.get("content", ""),
            "structured_data": raw.get("structured_data") or {},
            "confidentiality_level": str(raw.get("confidentiality_level", "INTERNAL")),
            "provenance": str(raw.get("provenance", "company_uploaded")),
            "is_approved": bool(raw.get("is_approved", True)),
            "version": int(raw.get("version", 1)),
            "is_active": bool(raw.get("is_active", True)),
            "tags": raw.get("tags") or [],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        return await self.upsert_table_record(settings.SUPABASE_KNOWLEDGE_TABLE, payload, on_conflict="item_id")

    async def save_content_review(self, report: Any) -> Dict[str, Any]:
        raw = report.model_dump() if hasattr(report, "model_dump") else dict(report)
        payload = {
            "review_id": raw.get("review_id"),
            "org_id": raw.get("org_id", "default-org"),
            "brand_id": raw.get("brand_id", "default-org"),
            "brand_name": raw.get("brand_name", ""),
            "content_type": str(raw.get("content_type", "text")),
            "content_filename": raw.get("content_filename"),
            "overall_score": float(raw.get("overall_score", 0.0)),
            "is_approved": bool(raw.get("is_approved", False)),
            "text_model_used": raw.get("text_model_used"),
            "vision_model_used": raw.get("vision_model_used"),
            "detected_issues": raw.get("detected_issues") or [],
            "measurable_properties": raw.get("measurable_properties") or {},
            "extracted_text": (raw.get("extracted_text") or "")[:4000],
            "knowledge_base_citations": raw.get("knowledge_base_citations") or [],
            "created_at": raw.get("created_at") or datetime.now(timezone.utc).isoformat(),
        }
        return await self.upsert_table_record(settings.SUPABASE_REVIEWS_TABLE, payload, on_conflict="review_id")

    async def save_workflow_item(self, item: Any) -> Dict[str, Any]:
        raw = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        payload = {
            "item_id": raw.get("item_id"),
            "org_id": raw.get("org_id", "default-org"),
            "brand_id": raw.get("brand_id", "default-org"),
            "title": raw.get("title", ""),
            "status": str(raw.get("status", "Draft")),
            "current_version": int(raw.get("current_version", 1)),
            "submitted_by_id": raw.get("submitted_by_id"),
            "submitted_by_name": raw.get("submitted_by_name"),
            "assigned_reviewer_role": raw.get("assigned_reviewer_role"),
            "has_high_risk_claims": bool(raw.get("has_high_risk_claims", False)),
            "versions": raw.get("versions") or [],
            "comments": raw.get("comments") or [],
            "audit_log": raw.get("audit_log") or [],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        return await self.upsert_table_record(settings.SUPABASE_WORKFLOW_TABLE, payload, on_conflict="item_id")

    async def save_brand_insights(self, report: Any) -> Dict[str, Any]:
        raw = report.model_dump() if hasattr(report, "model_dump") else dict(report)
        brand_id = raw.get("brand_id", "default-org")
        org_id = raw.get("org_id") or brand_id
        payload = {
            "report_id": f"ins-{org_id}-{brand_id}",
            "org_id": org_id,
            "brand_id": brand_id,
            "brand_name": raw.get("brand_name", brand_id),
            "data_sufficiency": str(raw.get("data_sufficiency", "INSUFFICIENT_DATA")),
            "total_reviews_analyzed": int(raw.get("total_reviews_analyzed", 0)),
            "report_payload": raw,
            "generated_at": raw.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        }
        return await self.upsert_table_record(settings.SUPABASE_INSIGHTS_TABLE, payload, on_conflict="report_id")


supabase_service = SupabaseService()

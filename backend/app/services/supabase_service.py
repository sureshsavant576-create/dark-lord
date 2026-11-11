from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import httpx

from backend.app.core.config import settings
from backend.app.models.brand_dna import BrandDNAProfile

logger = logging.getLogger(__name__)


class SupabaseService:
    """
    Handles persistence of approved Brand DNA profiles to Supabase PostgREST tables,
    with seamless fallback to the local persistent database when credentials are not configured.
    """

    def is_configured(self) -> bool:
        return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY and settings.SUPABASE_URL.strip() and settings.SUPABASE_KEY.strip())

    def get_status(self) -> Dict[str, Any]:
        url = settings.SUPABASE_URL or ""
        masked_url = url[:15] + "..." + url[-6:] if len(url) > 24 else (url or "Not configured")
        return {
            "configured": self.is_configured(),
            "supabase_url": masked_url if self.is_configured() else None,
            "target_table": settings.SUPABASE_TABLE,
            "recommended_sql_schema": (
                f"CREATE TABLE IF NOT EXISTS {settings.SUPABASE_TABLE} (\n"
                "  dna_id TEXT PRIMARY KEY,\n"
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
        }

    async def save_brand_dna_profile(self, profile: BrandDNAProfile) -> Dict[str, Any]:
        """
        Saves or upserts an approved Brand DNA Profile to Supabase.
        Returns a dictionary detailing synchronization status.
        """
        if not self.is_configured():
            logger.info("Supabase not configured; Brand DNA profile '%s' retained in local store.", profile.dna_id)
            return {
                "saved_to_supabase": False,
                "provider": "local_database_fallback",
                "message": "Supabase is not configured. Profile successfully saved and activated in local persistent storage."
            }

        url = settings.SUPABASE_URL.rstrip("/")
        api_key = settings.SUPABASE_KEY.strip()
        table = settings.SUPABASE_TABLE

        endpoint = f"{url}/rest/v1/{table}"
        headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation"
        }

        payload = {
            "dna_id": profile.dna_id,
            "brand_id": profile.brand_id,
            "company_name": profile.company_name,
            "status": profile.status.value if hasattr(profile.status, "value") else str(profile.status),
            "is_approved": profile.is_approved,
            "approved_by": profile.approved_by,
            "approved_at": profile.approved_at or datetime.now(timezone.utc).isoformat(),
            "company_facts": profile.company_facts.model_dump(),
            "ai_recommendations": profile.ai_recommendations.model_dump(),
            "created_at": profile.created_at,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                if res.status_code in (200, 201):
                    logger.info("Successfully synced Brand DNA '%s' to Supabase table '%s'.", profile.dna_id, table)
                    return {
                        "saved_to_supabase": True,
                        "provider": "supabase",
                        "table": table,
                        "record_id": profile.dna_id,
                        "status_code": res.status_code
                    }
                else:
                    error_msg = f"Supabase responded with status {res.status_code}: {res.text}"
                    logger.warning("Supabase sync failed for '%s': %s", profile.dna_id, error_msg)
                    return {
                        "saved_to_supabase": False,
                        "provider": "supabase_error_fallback",
                        "error": error_msg,
                        "fallback": "local_store"
                    }
        except Exception as exc:
            logger.error("Exception connecting to Supabase for '%s': %s", profile.dna_id, exc)
            return {
                "saved_to_supabase": False,
                "provider": "supabase_network_exception",
                "error": str(exc),
                "fallback": "local_store"
            }


supabase_service = SupabaseService()

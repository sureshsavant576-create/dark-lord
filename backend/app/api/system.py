"""BrandShield AI - System Health & AI Provider Introspection Endpoints."""
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter
from backend.app.ai.gateway import ai_gateway
from backend.app.core.config import settings

router = APIRouter(tags=["System"])


@router.get("/health")
def get_health() -> Dict[str, Any]:
    """Basic health check and system info."""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/providers")
def get_providers_status() -> Dict[str, Any]:
    """Exposes real-time configuration status of AI providers and deterministic engines.

    Never exposes secret API keys.
    """
    provider_config = settings.get_provider_status_dict()
    gateway_status = ai_gateway.get_status()

    return {
        "active_primary_provider": ai_gateway.get_primary_provider().provider_name() if ai_gateway.get_primary_provider() else None,
        "providers": provider_config,
        "gateway_live_status": gateway_status
    }

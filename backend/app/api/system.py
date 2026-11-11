from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter
from backend.app.ai.gateway import ai_gateway
from backend.app.core.config import settings

router = APIRouter(tags=["System"])

@router.get("/health")
def get_health() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/status")
def get_system_status() -> Dict[str, Any]:
    provider_config = settings.get_provider_status_dict()
    gateway_status = ai_gateway.get_status()
    primary = ai_gateway.get_primary_provider()

    return {
        "app_name": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "active_primary_provider": primary.provider_name() if primary else None,
        "providers": provider_config,
        "gateway_live_status": gateway_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/providers")
def get_providers_status() -> Dict[str, Any]:
    provider_config = settings.get_provider_status_dict()
    gateway_status = ai_gateway.get_status()

    return {
        "active_primary_provider": ai_gateway.get_primary_provider().provider_name() if ai_gateway.get_primary_provider() else None,
        "providers": provider_config,
        "gateway_live_status": gateway_status
    }

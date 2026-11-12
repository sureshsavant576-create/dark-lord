from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response

from backend.app.core.auth import (
    UserContext,
    UserRole as AuthUserRole,
    get_current_user,
    verify_tenant_access,
)
from backend.app.core.security import check_role_clearance
from backend.app.models.knowledge_base import (
    KnowledgeCategory,
    KnowledgeItem,
    KnowledgeItemCreate,
    KnowledgeItemUpdate,
    KnowledgeSearchQuery,
    KnowledgeSearchResult,
    KnowledgeVersionSnapshot,
)
from backend.app.services.knowledge_service import knowledge_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["Brand Knowledge Base"])


def _is_restricted_from_user(item: KnowledgeItem, user: UserContext) -> bool:
    """
    Prevents Developers and non-privileged users from accessing confidential company
    knowledge, prohibited messaging playbooks, or executive policy exceptions.
    """
    if user.role in (AuthUserRole.ADMIN, AuthUserRole.COMPLIANCE_LEAD):
        return False
    conf_level = (getattr(item, "confidentiality_level", "INTERNAL") or "INTERNAL").upper()
    if user.role == AuthUserRole.DEVELOPER:
        if conf_level in ("CONFIDENTIAL", "RESTRICTED"):
            return True
        if item.category in (KnowledgeCategory.PROHIBITED_MESSAGING, KnowledgeCategory.POLICY_EXCEPTION):
            return True
        lower_tags = {t.lower() for t in (item.tags or [])}
        if "confidential" in lower_tags or "restricted" in lower_tags or "executive" in lower_tags:
            return True
        return False
    return not check_role_clearance(user.role.value, conf_level)


@router.get("/items", response_model=List[KnowledgeItem])
def list_knowledge_items(
    org_id: str = Query(default="default-org", description="Tenant organization ID"),
    brand_id: Optional[str] = Query(default=None, description="Optional brand filter"),
    category: Optional[KnowledgeCategory] = Query(default=None, description="Optional category filter"),
    active_only: bool = Query(default=True, description="Filter only active items"),
    user: UserContext = Depends(get_current_user)
):
    """
    Lists knowledge base items strictly partitioned by organization ID.
    Preserves company confidentiality and tenant isolation.
    """
    verify_tenant_access(user, org_id)
    items = knowledge_service.list_items(
        org_id=org_id,
        brand_id=brand_id,
        category=category,
        active_only=active_only
    )
    return [item for item in items if not _is_restricted_from_user(item, user)]


@router.post("/items", response_model=KnowledgeItem)
def create_knowledge_item(
    item_in: KnowledgeItemCreate,
    background_tasks: BackgroundTasks,
    user: UserContext = Depends(get_current_user)
):
    """
    Creates a new Knowledge Base item.
    Enforces Rule 6: Never treats AI-generated recommendations as official company facts without approval.
    """
    verify_tenant_access(user, item_in.org_id)
    if user.role in (AuthUserRole.DEVELOPER, AuthUserRole.VIEWER):
        raise HTTPException(status_code=403, detail="Role does not have permission to modify official company knowledge.")
    try:
        item = knowledge_service.create_item(item_in)
        from backend.app.services.supabase_service import supabase_service
        background_tasks.add_task(supabase_service.save_knowledge_item, item)
        return item
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.error("Failed to create knowledge item: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save knowledge item.")


@router.get("/items/{item_id}", response_model=KnowledgeItem)
def get_knowledge_item(
    item_id: str,
    org_id: Optional[str] = Query(default=None, description="Tenant organization ID"),
    user: UserContext = Depends(get_current_user)
):
    target_org = org_id or user.org_id or "default-org"
    verify_tenant_access(user, target_org)
    item = knowledge_service.get_item(item_id=item_id, org_id=target_org)
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found or access denied.")
    if _is_restricted_from_user(item, user):
        raise HTTPException(status_code=403, detail="Access denied: insufficient clearance for confidential company document.")
    return item


@router.put("/items/{item_id}", response_model=KnowledgeItem)
def update_knowledge_item(
    item_id: str,
    update_in: KnowledgeItemUpdate,
    org_id: Optional[str] = Query(default=None, description="Tenant organization ID"),
    user: UserContext = Depends(get_current_user)
):
    """
    Updates an existing knowledge item.
    Creates an immutable version snapshot in the audit log, bumps the version number,
    and updates semantic vector embeddings.
    """
    target_org = org_id or user.org_id or "default-org"
    verify_tenant_access(user, target_org)
    if user.role in (AuthUserRole.DEVELOPER, AuthUserRole.VIEWER):
        raise HTTPException(status_code=403, detail="Role does not have permission to update company knowledge.")
    try:
        return knowledge_service.update_item(item_id=item_id, org_id=target_org, update_in=update_in)
    except KeyError:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as exc:
        logger.error("Update failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Update failed: {str(exc)}")


@router.get("/items/{item_id}/history", response_model=List[KnowledgeVersionSnapshot])
def get_knowledge_item_history(
    item_id: str,
    org_id: Optional[str] = Query(default=None, description="Tenant organization ID"),
    user: UserContext = Depends(get_current_user)
):
    """
    Retrieves full version history and changelog snapshots for a knowledge guideline.
    """
    target_org = org_id or user.org_id or "default-org"
    verify_tenant_access(user, target_org)
    item = knowledge_service.get_item(item_id=item_id, org_id=target_org)
    if item and _is_restricted_from_user(item, user):
        raise HTTPException(status_code=403, detail="Access denied: insufficient clearance for confidential history.")
    return knowledge_service.get_version_history(item_id=item_id, org_id=target_org)


@router.delete("/items/{item_id}")
def delete_knowledge_item(
    item_id: str,
    org_id: Optional[str] = Query(default=None, description="Tenant organization ID"),
    user: UserContext = Depends(get_current_user)
):
    """
    Deletes an isolated knowledge item.
    """
    target_org = org_id or user.org_id or "default-org"
    verify_tenant_access(user, target_org)
    if user.role in (AuthUserRole.DEVELOPER, AuthUserRole.VIEWER):
        raise HTTPException(status_code=403, detail="Role does not have permission to delete company knowledge.")
    deleted = knowledge_service.delete_item(item_id=item_id, org_id=target_org)
    if not deleted:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    return {"status": "success", "message": f"Knowledge item '{item_id}' deleted."}


@router.post("/search", response_model=List[KnowledgeSearchResult])
def search_knowledge_base(
    query: KnowledgeSearchQuery,
    user: UserContext = Depends(get_current_user)
):
    """
    Semantic vector retrieval using pgvector cosine distance algorithm.
    Strictly filters within the tenant's organisation and retrieves only approved items.
    """
    verify_tenant_access(user, query.org_id)
    results = knowledge_service.search_knowledge_base(query)
    return [r for r in results if not _is_restricted_from_user(r.item, user)]


@router.get("/supabase/schema")
def get_supabase_rls_schema():
    """
    Generates and returns the complete Supabase SQL migration script for
    Row Level Security (RLS) policies and pgvector extension setup.
    """
    sql = knowledge_service.get_supabase_rls_sql()
    return {
        "table": "brand_knowledge_items",
        "rls_enabled": True,
        "pgvector_dimension": 384,
        "migration_sql": sql
    }


@router.post("/seed")
def seed_enterprise_knowledge_base(
    org_id: str = Query(default="org-apex-cloud"),
    brand_id: str = Query(default="apex-cloud")
):
    """
    Pre-seeds an enterprise knowledge base covering all 10 mandated categories:
    Approved Brand DNA, official guidelines, company facts, product & service info,
    approved promotional claims with evidence, approved terminology, official logos/assets,
    approved reference designs, prohibited messaging, and policy exceptions.
    """
    count = knowledge_service.seed_enterprise_knowledge_base(org_id=org_id, brand_id=brand_id)
    all_items = knowledge_service.list_items(org_id=org_id, brand_id=brand_id, active_only=False)
    return {
        "status": "success",
        "org_id": org_id,
        "brand_id": brand_id,
        "items_seeded": count,
        "total_items": len(all_items),
        "message": f"Successfully ensured enterprise knowledge items (total: {len(all_items)})."
    }

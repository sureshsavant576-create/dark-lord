from pathlib import Path
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from backend.app.core.auth import (
    UserContext,
    UserRole as AuthUserRole,
    get_current_user,
    verify_tenant_access,
)
from backend.app.core.config import settings
from backend.app.core.security import (
    ConfidentialityLevel,
    SecurityPathTraversalError,
    TenantIsolationViolationError,
    UserRole,
    check_role_clearance,
    get_tenant_storage_path,
    inspect_file_magic_bytes,
    safe_join_path,
    sanitize_filename,
    sanitize_org_id,
    verify_tenant_isolation,
)
from backend.app.models.audit import AuditEventSeverity, AuditEventType
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/storage", tags=["Secure Storage & Asset Governance"])


@router.post("/upload")
async def secure_file_upload(
    file: UploadFile = File(...),
    org_id: str = Form("default-org"),
    user_role: str = Form("Creator"),
    user_id: str = Form("user-1"),
    confidentiality: str = Form("INTERNAL"),
    subfolder: str = Form("uploads"),
    user: UserContext = Depends(get_current_user)
):
    """
    Secure file upload endpoint with:
    - Magic bytes signature verification
    - Path traversal sanitization
    - Organisation-level directory separation
    - Audit logging
    """
    clean_org = sanitize_org_id(org_id)
    if user.role != AuthUserRole.ADMIN:
        verify_tenant_access(user, clean_org)
    content = await file.read()

    # 1. Inspect magic bytes
    is_valid, detected_mime, message = inspect_file_magic_bytes(content, file.filename or "file")
    if not is_valid:
        audit_service.log_event(
            event_type=AuditEventType.ACCESS_DENIED,
            org_id=clean_org,
            user_id=user_id,
            user_role=user_role,
            severity=AuditEventSeverity.WARNING,
            resource_type="file_upload",
            resource_id=file.filename or "unknown",
            action="UPLOAD_REJECTED_MAGIC_BYTES",
            details={"reason": message, "declared_name": file.filename},
            success=False
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload rejected: {message}"
        )

    # 2. Compute safe storage destination in tenant sandbox
    tenant_dir = get_tenant_storage_path(clean_org, subfolder=subfolder)
    ext = Path(file.filename or "file").suffix.lower()
    file_id = f"{uuid.uuid4().hex[:12]}{ext}"
    safe_dest = safe_join_path(tenant_dir, file_id)

    # 3. Save bytes safely
    safe_dest.write_bytes(content)

    # 4. Audit log event
    audit_service.log_event(
        event_type=AuditEventType.FILE_UPLOAD,
        org_id=clean_org,
        user_id=user_id,
        user_role=user_role,
        severity=AuditEventSeverity.INFO,
        resource_type="file_upload",
        resource_id=file_id,
        action="SECURE_FILE_UPLOADED",
        details={
            "original_filename": file.filename,
            "detected_mime": detected_mime,
            "size_bytes": len(content),
            "confidentiality": confidentiality,
            "subfolder": subfolder
        },
        success=True
    )

    return {
        "success": True,
        "file_id": file_id,
        "filename": safe_dest.name,
        "org_id": clean_org,
        "mime_type": detected_mime,
        "size_bytes": len(content),
        "confidentiality": confidentiality,
        "path": f"/api/v1/storage/file?org_id={clean_org}&file_id={file_id}&subfolder={subfolder}"
    }


@router.get("/file")
def get_secure_file(
    file_id: str = Query(..., description="Unique file identifier or filename"),
    org_id: str = Query("default-org", description="Tenant organization ID"),
    user_role: Optional[str] = Query(None, description="Requester user role"),
    user_id: str = Query("user-1", description="Requester ID"),
    subfolder: str = Query("uploads", description="Target subfolder"),
    confidentiality: str = Query("INTERNAL", description="Document confidentiality level"),
    user: UserContext = Depends(get_current_user)
):
    """
    Serves confidential company files with:
    - Multi-tenant data isolation
    - Role-based confidentiality clearance checking
    - Path traversal prevention
    - Access audit trails
    """
    clean_org = sanitize_org_id(org_id)

    # Multi-tenant data isolation: Block accessing files from another organization
    if user.role != AuthUserRole.ADMIN:
        verify_tenant_access(user, clean_org)

    effective_role = user_role or user.role.value
    # 1. Clearance check for confidential company files
    if not check_role_clearance(effective_role, confidentiality):
        audit_service.log_event(
            event_type=AuditEventType.ACCESS_DENIED,
            org_id=clean_org,
            user_id=user_id,
            user_role=effective_role,
            severity=AuditEventSeverity.WARNING,
            resource_type="confidential_file",
            resource_id=file_id,
            action="FILE_ACCESS_DENIED_CLEARANCE",
            details={"requested_confidentiality": confidentiality, "role": effective_role},
            success=False
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Role '{effective_role}' lacks clearance for '{confidentiality}' documents."
        )

    # 2. Safe path resolution
    try:
        tenant_dir = get_tenant_storage_path(clean_org, subfolder=subfolder)
        file_path = safe_join_path(tenant_dir, file_id)
    except SecurityPathTraversalError as exc:
        audit_service.log_event(
            event_type=AuditEventType.PATH_TRAVERSAL_BLOCKED,
            org_id=clean_org,
            user_id=user_id,
            user_role=user_role,
            severity=AuditEventSeverity.CRITICAL,
            resource_type="file",
            resource_id=file_id,
            action="PATH_TRAVERSAL_ATTEMPT",
            details={"error": str(exc)},
            success=False
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path.")

    # Fallback to shared legacy uploads directory if not yet migrated to tenant dir
    if not file_path.exists():
        legacy_path = settings.UPLOADS_DIR / sanitize_filename(file_id)
        if legacy_path.exists():
            file_path = legacy_path

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    # 3. Log authorized access
    audit_service.log_event(
        event_type=AuditEventType.FILE_ACCESS,
        org_id=clean_org,
        user_id=user_id,
        user_role=user_role,
        severity=AuditEventSeverity.INFO,
        resource_type="company_file",
        resource_id=file_id,
        action="CONFIDENTIAL_FILE_SERVED",
        details={"confidentiality": confidentiality},
        success=True
    )

    return FileResponse(file_path, filename=file_path.name)

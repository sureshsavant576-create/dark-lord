from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr

from backend.app.core.auth import (
    UserContext,
    UserRecord,
    UserRole,
    auth_service,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    role: Optional[UserRole] = UserRole.DEVELOPER
    org_id: Optional[str] = "default-org"

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    user_id: str
    email: str
    role: str
    role_label: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    org_id: str
    session_token: str

@router.post("/register", response_model=AuthResponse)
def register(
    request: RegisterRequest,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(default=None)
):
    assigned_role = request.role or UserRole.DEVELOPER
    if assigned_role in (UserRole.ADMIN, "admin"):
        is_admin_creator = False
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split("Bearer ", 1)[1].strip()
            ctx = auth_service.verify_token(token)
            if ctx and ctx.role == UserRole.ADMIN:
                is_admin_creator = True
        if not is_admin_creator:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Administrative accounts cannot be self-registered. Only an active Administrator can assign the admin role."
            )

    record = auth_service.register_user(
        email=request.email,
        password=request.password,
        role=assigned_role,
        org_id=request.org_id or "default-org"
    )
    token = auth_service.create_session_token(record.user_id, record.role.value, record.org_id)
    from backend.app.services.supabase_service import supabase_service
    background_tasks.add_task(
        supabase_service.register_supabase_user,
        record.email,
        request.password,
        record.role_label or record.role.value,
        record.org_id,
        record.full_name,
    )
    return AuthResponse(
        user_id=record.user_id,
        email=record.email,
        role=record.role.value,
        role_label=record.role_label or record.role.value,
        full_name=record.full_name,
        department=record.department,
        org_id=record.org_id,
        session_token=token
    )

@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest):
    record, token = auth_service.authenticate_user(request.email, request.password)
    return AuthResponse(
        user_id=record.user_id,
        email=record.email,
        role=record.role.value,
        role_label=record.role_label or record.role.value,
        full_name=record.full_name,
        department=record.department,
        org_id=record.org_id,
        session_token=token
    )

@router.get("/me")
def get_current_user_profile(user: UserContext = Depends(get_current_user)):
    return {
        "user_id": user.user_id,
        "role": user.role.value,
        "role_label": user.role_label or user.role.value,
        "full_name": user.full_name,
        "department": user.department,
        "org_id": user.org_id,
        "email": user.email
    }

@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        auth_service.revoke_session(token)
    return {"status": "success", "message": "Session invalidated successfully."}

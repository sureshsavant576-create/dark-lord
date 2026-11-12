import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_auth_login_demo_admin():
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@sanket.ai", "password": "DemoJudge2026!"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["email"] == "demo@sanket.ai"
    assert data["role"] == "admin"
    assert "session_token" in data
    assert len(data["session_token"]) > 20

    # Test /me endpoint
    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {data['session_token']}"}
    )
    assert me_res.status_code == 200, me_res.text
    me_data = me_res.json()
    assert me_data["email"] == "demo@sanket.ai"
    assert me_data["role"] == "admin"

def test_auth_register_and_login_flow():
    import uuid
    uid = uuid.uuid4().hex[:6]
    email = f"user_{uid}@testcorp.io"
    password = "SecurePassword2026!"

    # 1. Register new developer
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "role": "developer",
            "org_id": "test-org-1",
            "full_name": "Test Engineer"
        }
    )
    assert reg_res.status_code == 200, reg_res.text
    reg_data = reg_res.json()
    assert reg_data["email"] == email
    assert reg_data["role"] == "developer"
    assert "session_token" in reg_data

    # 2. Login with registered user
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    assert login_res.status_code == 200, login_res.text
    login_data = login_res.json()
    assert login_data["email"] == email
    token = login_data["session_token"]

    # 3. Test /me
    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # 4. Logout (revoke session)
    logout_res = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert logout_res.status_code == 200

    # 5. Verify token is revoked
    revoked_me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert revoked_me.status_code == 401

def test_auth_invalid_credentials():
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@user.com", "password": "WrongPassword!"}
    )
    assert res.status_code == 401

def test_auth_short_password_rejected():
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "shortpass@user.com", "password": "123"}
    )
    assert res.status_code == 400

def test_auth_unauthorized_admin_self_registration():
    import uuid
    uid = uuid.uuid4().hex[:6]
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"fake_admin_{uid}@testcorp.io",
            "password": "SecurePassword2026!",
            "role": "admin"
        }
    )
    assert res.status_code == 403

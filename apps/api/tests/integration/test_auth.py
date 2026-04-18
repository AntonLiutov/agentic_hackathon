from fastapi.testclient import TestClient
from pytest import MonkeyPatch


def _set_session_cookie(auth_client: TestClient, token: str) -> None:
    auth_client.cookies.set("agentic_chat_session", token)


def test_register_creates_user_and_sets_session_cookie(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/auth/register",
        json={
            "email": "sarah@example.com",
            "username": "sarah.connor",
            "password": "correct-horse-battery-staple",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["user"]["email"] == "sarah@example.com"
    assert payload["user"]["username"] == "sarah.connor"
    assert auth_client.cookies.get("agentic_chat_session")


def test_register_rejects_duplicate_email(auth_client: TestClient) -> None:
    payload = {
        "email": "dupe@example.com",
        "username": "first.user",
        "password": "correct-horse-battery-staple",
    }
    duplicate_payload = {
        "email": "dupe@example.com",
        "username": "second.user",
        "password": "correct-horse-battery-staple",
    }

    first_response = auth_client.post("/api/auth/register", json=payload)
    second_response = auth_client.post("/api/auth/register", json=duplicate_payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Email is already registered."


def test_login_me_and_logout_flow(auth_client: TestClient) -> None:
    register_response = auth_client.post(
        "/api/auth/register",
        json={
            "email": "mike@example.com",
            "username": "mike",
            "password": "correct-horse-battery-staple",
        },
    )
    assert register_response.status_code == 201

    logout_response = auth_client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"success": True}

    me_after_logout = auth_client.get("/api/auth/me")
    assert me_after_logout.status_code == 401

    login_response = auth_client.post(
        "/api/auth/login",
        json={
            "email": "mike@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert login_response.status_code == 200

    me_response = auth_client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["user"]["username"] == "mike"


def test_sessions_list_and_targeted_revocation(auth_client: TestClient) -> None:
    register_response = auth_client.post(
        "/api/auth/register",
        json={
            "email": "jane@example.com",
            "username": "jane",
            "password": "correct-horse-battery-staple",
        },
    )
    assert register_response.status_code == 201
    first_session_token = auth_client.cookies.get("agentic_chat_session")
    assert first_session_token is not None

    login_response = auth_client.post(
        "/api/auth/login",
        json={
            "email": "jane@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert login_response.status_code == 200
    second_session_token = auth_client.cookies.get("agentic_chat_session")
    assert second_session_token is not None

    sessions_response = auth_client.get("/api/auth/sessions")
    assert sessions_response.status_code == 200

    sessions = sessions_response.json()["sessions"]
    assert len(sessions) == 2
    current_session = next(session for session in sessions if session["is_current"])
    other_session = next(session for session in sessions if not session["is_current"])

    current_revoke_response = auth_client.delete(f"/api/auth/sessions/{current_session['id']}")
    assert current_revoke_response.status_code == 400
    assert (
        current_revoke_response.json()["detail"]
        == "Use sign out to end the current browser session."
    )

    revoke_response = auth_client.delete(f"/api/auth/sessions/{other_session['id']}")
    assert revoke_response.status_code == 200
    assert revoke_response.json() == {"success": True}

    sessions_after_revoke = auth_client.get("/api/auth/sessions")
    assert sessions_after_revoke.status_code == 200
    assert len(sessions_after_revoke.json()["sessions"]) == 1
    assert sessions_after_revoke.json()["sessions"][0]["id"] == current_session["id"]

    _set_session_cookie(auth_client, first_session_token)
    revoked_me = auth_client.get("/api/auth/me")
    assert revoked_me.status_code == 401

    _set_session_cookie(auth_client, second_session_token)
    current_me = auth_client.get("/api/auth/me")
    assert current_me.status_code == 200
    assert current_me.json()["user"]["username"] == "jane"


def test_change_password_revokes_all_sessions_and_requires_new_login(
    auth_client: TestClient,
) -> None:
    register_response = auth_client.post(
        "/api/auth/register",
        json={
            "email": "change@example.com",
            "username": "changeuser",
            "password": "correct-horse-battery-staple",
        },
    )
    assert register_response.status_code == 201
    first_session_token = auth_client.cookies.get("agentic_chat_session")
    assert first_session_token is not None

    login_response = auth_client.post(
        "/api/auth/login",
        json={
            "email": "change@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert login_response.status_code == 200
    second_session_token = auth_client.cookies.get("agentic_chat_session")
    assert second_session_token is not None

    change_response = auth_client.post(
        "/api/auth/password/change",
        json={
            "current_password": "correct-horse-battery-staple",
            "new_password": "new-horse-battery-staple",
        },
    )
    assert change_response.status_code == 200
    assert (
        change_response.json()["message"]
        == "Password updated. Please sign in again with your new password."
    )

    current_me = auth_client.get("/api/auth/me")
    assert current_me.status_code == 401

    _set_session_cookie(auth_client, first_session_token)
    first_session_me = auth_client.get("/api/auth/me")
    assert first_session_me.status_code == 401

    old_login = auth_client.post(
        "/api/auth/login",
        json={
            "email": "change@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert old_login.status_code == 401

    new_login = auth_client.post(
        "/api/auth/login",
        json={
            "email": "change@example.com",
            "password": "new-horse-battery-staple",
        },
    )
    assert new_login.status_code == 200

    _set_session_cookie(auth_client, second_session_token)
    second_session_me = auth_client.get("/api/auth/me")
    assert second_session_me.status_code == 401


def test_password_reset_flow_invalidates_existing_sessions(
    auth_client: TestClient,
    monkeypatch: MonkeyPatch,
) -> None:
    outbox: list[dict[str, str]] = []

    async def fake_send_password_reset_email(
        *,
        settings: object,
        recipient_email: str,
        username: str,
        reset_url: str,
        expires_in_seconds: int,
    ) -> None:
        outbox.append(
            {
                "recipient_email": recipient_email,
                "username": username,
                "reset_url": reset_url,
                "expires_in_seconds": str(expires_in_seconds),
            }
        )

    monkeypatch.setattr(
        "app.auth.service.send_password_reset_email",
        fake_send_password_reset_email,
    )

    register_response = auth_client.post(
        "/api/auth/register",
        json={
            "email": "reset@example.com",
            "username": "resetuser",
            "password": "correct-horse-battery-staple",
        },
    )
    assert register_response.status_code == 201
    original_session_token = auth_client.cookies.get("agentic_chat_session")
    assert original_session_token is not None

    forgot_response = auth_client.post(
        "/api/auth/password/forgot",
        json={"email": "reset@example.com"},
    )
    assert forgot_response.status_code == 200
    forgot_payload = forgot_response.json()
    assert forgot_payload["success"] is True
    assert (
        forgot_payload["message"]
        == (
            "If an account exists for this email, check Mailpit at "
            "http://localhost:8025 for the reset link."
        )
    )
    assert len(outbox) == 1
    assert outbox[0]["recipient_email"] == "reset@example.com"
    reset_url = outbox[0]["reset_url"]
    reset_token = reset_url.split("token=", 1)[1]

    validate_response = auth_client.get(f"/api/auth/password/reset/{reset_token}")
    assert validate_response.status_code == 200
    assert validate_response.json() == {"valid": True}

    reset_response = auth_client.post(
        "/api/auth/password/reset",
        json={
            "token": reset_token,
            "new_password": "brand-new-horse-battery-staple",
        },
    )
    assert reset_response.status_code == 200
    assert (
        reset_response.json()["message"]
        == "Password reset complete. Please sign in with your new password."
    )

    _set_session_cookie(auth_client, original_session_token)
    me_after_reset = auth_client.get("/api/auth/me")
    assert me_after_reset.status_code == 401

    old_login = auth_client.post(
        "/api/auth/login",
        json={
            "email": "reset@example.com",
            "password": "correct-horse-battery-staple",
        },
    )
    assert old_login.status_code == 401

    new_login = auth_client.post(
        "/api/auth/login",
        json={
            "email": "reset@example.com",
            "password": "brand-new-horse-battery-staple",
        },
    )
    assert new_login.status_code == 200

    reused_token = auth_client.get(f"/api/auth/password/reset/{reset_token}")
    assert reused_token.status_code == 400

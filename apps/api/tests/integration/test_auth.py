from fastapi.testclient import TestClient


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

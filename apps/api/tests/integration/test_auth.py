from fastapi.testclient import TestClient


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

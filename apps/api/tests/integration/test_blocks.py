from fastapi.testclient import TestClient


def _register_user(
    client: TestClient,
    *,
    email: str,
    username: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
        },
    )
    assert response.status_code == 201


def _login_user(
    client: TestClient,
    *,
    email: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200


def _create_friendship(
    client: TestClient,
    *,
    left_email: str,
    right_username: str,
    right_email: str,
) -> None:
    _login_user(client, email=left_email)
    request_response = client.post(
        "/api/friends/requests",
        json={"username": right_username},
    )
    assert request_response.status_code == 201
    client.post("/api/auth/logout")
    _login_user(client, email=right_email)
    accept_response = client.post(
        f"/api/friends/requests/{request_response.json()['id']}/accept"
    )
    assert accept_response.status_code == 200


def test_blocking_user_freezes_existing_dm_and_removes_friendship(auth_client: TestClient) -> None:
    _register_user(auth_client, email="block-alpha@example.com", username="block.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="block-beta@example.com", username="block.beta")
    auth_client.post("/api/auth/logout")

    _create_friendship(
        auth_client,
        left_email="block-alpha@example.com",
        right_username="block.beta",
        right_email="block-beta@example.com",
    )

    create_dm_response = auth_client.post("/api/dms", json={"username": "block.alpha"})
    assert create_dm_response.status_code == 201
    dm_id = create_dm_response.json()["id"]

    block_response = auth_client.post(
        "/api/blocks",
        json={"username": "block.alpha", "reason": "Do not contact me."},
    )
    assert block_response.status_code == 201
    assert block_response.json()["blocked_username"] == "block.alpha"

    friends_response = auth_client.get("/api/friends")
    assert friends_response.status_code == 200
    assert friends_response.json()["friends"] == []

    dm_summary_response = auth_client.get(f"/api/dms/{dm_id}")
    assert dm_summary_response.status_code == 200
    assert dm_summary_response.json()["status"] == "frozen"
    assert dm_summary_response.json()["can_message"] is False

    direct_messages_response = auth_client.get("/api/dms/mine")
    assert direct_messages_response.status_code == 200
    direct_messages = direct_messages_response.json()["direct_messages"]
    assert len(direct_messages) == 1
    assert direct_messages[0]["id"] == dm_id
    assert direct_messages[0]["status"] == "frozen"
    assert direct_messages[0]["can_message"] is False

    message_response = auth_client.post(
        f"/api/conversations/{dm_id}/messages",
        json={"body_text": "Trying to write in a frozen DM."},
    )
    assert message_response.status_code == 403
    assert message_response.json()["detail"] == "This direct message is read-only right now."

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="block-alpha@example.com")

    blocked_dm_response = auth_client.post("/api/dms", json={"username": "block.beta"})
    assert blocked_dm_response.status_code == 403
    assert (
        blocked_dm_response.json()["detail"]
        == "Direct messages are unavailable because one user blocked the other."
    )


def test_unblocking_user_keeps_dm_frozen_until_friendship_returns(auth_client: TestClient) -> None:
    _register_user(auth_client, email="unblock-alpha@example.com", username="unblock.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="unblock-beta@example.com", username="unblock.beta")
    auth_client.post("/api/auth/logout")

    _create_friendship(
        auth_client,
        left_email="unblock-alpha@example.com",
        right_username="unblock.beta",
        right_email="unblock-beta@example.com",
    )

    create_dm_response = auth_client.post("/api/dms", json={"username": "unblock.alpha"})
    assert create_dm_response.status_code == 201
    dm_id = create_dm_response.json()["id"]

    block_response = auth_client.post("/api/blocks", json={"username": "unblock.alpha"})
    assert block_response.status_code == 201

    unblock_response = auth_client.delete(
        f"/api/blocks/{block_response.json()['blocked_user_id']}"
    )
    assert unblock_response.status_code == 200

    dm_summary_response = auth_client.get(f"/api/dms/{dm_id}")
    assert dm_summary_response.status_code == 200
    assert dm_summary_response.json()["status"] == "frozen"
    assert dm_summary_response.json()["can_message"] is False

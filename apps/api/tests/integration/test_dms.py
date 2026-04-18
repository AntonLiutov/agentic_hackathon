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


def test_direct_message_creation_listing_and_access_rules(auth_client: TestClient) -> None:
    _register_user(
        auth_client,
        email="dm-owner@example.com",
        username="dm.owner",
    )
    auth_client.post("/api/auth/logout")

    _register_user(
        auth_client,
        email="dm-target@example.com",
        username="dm.target",
    )
    auth_client.post("/api/auth/logout")

    _register_user(
        auth_client,
        email="dm-outsider@example.com",
        username="dm.outsider",
    )
    auth_client.post("/api/auth/logout")

    _login_user(auth_client, email="dm-owner@example.com")

    create_response = auth_client.post(
        "/api/dms",
        json={"username": "dm.target"},
    )
    assert create_response.status_code == 201
    dm_payload = create_response.json()
    assert dm_payload["counterpart_username"] == "dm.target"
    assert dm_payload["can_message"] is True
    dm_id = dm_payload["id"]

    repeat_create_response = auth_client.post(
        "/api/dms",
        json={"username": "dm.target"},
    )
    assert repeat_create_response.status_code == 201
    assert repeat_create_response.json()["id"] == dm_id

    my_dms_response = auth_client.get("/api/dms/mine")
    assert my_dms_response.status_code == 200
    assert [dm["counterpart_username"] for dm in my_dms_response.json()["direct_messages"]] == [
        "dm.target"
    ]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="dm-target@example.com")

    target_dm_summary = auth_client.get(f"/api/dms/{dm_id}")
    assert target_dm_summary.status_code == 200
    assert target_dm_summary.json()["counterpart_username"] == "dm.owner"

    target_dms = auth_client.get("/api/dms/mine")
    assert target_dms.status_code == 200
    assert [dm["counterpart_username"] for dm in target_dms.json()["direct_messages"]] == [
        "dm.owner"
    ]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="dm-outsider@example.com")

    outsider_dm_summary = auth_client.get(f"/api/dms/{dm_id}")
    assert outsider_dm_summary.status_code == 404
    assert outsider_dm_summary.json()["detail"] == "Direct message not found."

    self_dm_response = auth_client.post(
        "/api/dms",
        json={"username": "dm.outsider"},
    )
    assert self_dm_response.status_code == 400
    assert (
        self_dm_response.json()["detail"]
        == "You cannot create a direct message with yourself."
    )

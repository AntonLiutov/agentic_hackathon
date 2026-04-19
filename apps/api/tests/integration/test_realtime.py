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
    requester_email: str,
    recipient_email: str,
    recipient_username: str,
) -> None:
    _login_user(client, email=requester_email)
    request_response = client.post(
        "/api/friends/requests",
        json={"username": recipient_username},
    )
    assert request_response.status_code == 201
    client.post("/api/auth/logout")
    _login_user(client, email=recipient_email)
    accept_response = client.post(
        f"/api/friends/requests/{request_response.json()['id']}/accept"
    )
    assert accept_response.status_code == 200


def test_room_websocket_streams_message_events(auth_client: TestClient) -> None:
    _register_user(auth_client, email="rt-room-owner@example.com", username="rt.room.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "realtime-room",
            "description": "Room for realtime event testing.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    with auth_client.websocket_connect(f"/ws/conversations/{room_id}") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "conversation.subscribed"
        assert subscribed_event["conversation_id"] == room_id
        assert subscribed_event["sequence_head"] == 0

        create_response = auth_client.post(
            f"/api/conversations/{room_id}/messages",
            json={"body_text": "Realtime room message"},
        )
        assert create_response.status_code == 201
        created_event = websocket.receive_json()
        assert created_event["type"] == "message.created"
        assert created_event["message"]["body_text"] == "Realtime room message"
        assert created_event["sequence_head"] == 1

        message_id = created_event["message"]["id"]

        edit_response = auth_client.patch(
            f"/api/messages/{message_id}",
            json={"body_text": "Edited realtime room message"},
        )
        assert edit_response.status_code == 200
        updated_event = websocket.receive_json()
        assert updated_event["type"] == "message.updated"
        assert updated_event["message"]["body_text"] == "Edited realtime room message"
        assert updated_event["message"]["is_edited"] is True

        delete_response = auth_client.delete(f"/api/messages/{message_id}")
        assert delete_response.status_code == 200
        deleted_event = websocket.receive_json()
        assert deleted_event["type"] == "message.deleted"
        assert deleted_event["message"]["is_deleted"] is True
        assert deleted_event["message"]["body_text"] is None


def test_dm_websocket_streams_message_creation(auth_client: TestClient) -> None:
    _register_user(auth_client, email="rt-dm-alpha@example.com", username="rt.dm.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="rt-dm-beta@example.com", username="rt.dm.beta")
    auth_client.post("/api/auth/logout")

    _create_friendship(
        auth_client,
        requester_email="rt-dm-alpha@example.com",
        recipient_email="rt-dm-beta@example.com",
        recipient_username="rt.dm.beta",
    )
    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="rt-dm-alpha@example.com")
    dm_response = auth_client.post("/api/dms", json={"username": "rt.dm.beta"})
    assert dm_response.status_code == 201
    dm_id = dm_response.json()["id"]

    with auth_client.websocket_connect(f"/ws/conversations/{dm_id}") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "conversation.subscribed"
        assert subscribed_event["conversation_id"] == dm_id

        create_response = auth_client.post(
            f"/api/conversations/{dm_id}/messages",
            json={"body_text": "Realtime DM message"},
        )
        assert create_response.status_code == 201

        created_event = websocket.receive_json()
        assert created_event["type"] == "message.created"
        assert created_event["message"]["conversation_id"] == dm_id
        assert created_event["message"]["body_text"] == "Realtime DM message"


def test_room_realtime_message_permissions_are_projected_per_recipient(
    auth_client: TestClient,
) -> None:
    _register_user(auth_client, email="rt-owner@example.com", username="rt.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "rt-room-permissions",
            "description": "Room for recipient permission projection.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="rt-guest@example.com", username="rt.guest")
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    with auth_client.websocket_connect(f"/ws/conversations/{room_id}") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "conversation.subscribed"

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="rt-owner@example.com")

        create_response = auth_client.post(
            f"/api/conversations/{room_id}/messages",
            json={"body_text": "Owner message for guest permissions"},
        )
        assert create_response.status_code == 201

        created_event = websocket.receive_json()
        assert created_event["type"] == "message.created"
        assert created_event["message"]["body_text"] == "Owner message for guest permissions"
        assert created_event["message"]["can_edit"] is False
        assert created_event["message"]["can_delete"] is False


def test_dm_realtime_message_permissions_are_projected_per_recipient(
    auth_client: TestClient,
) -> None:
    _register_user(auth_client, email="rt-dm-owner@example.com", username="rt.dm.owner")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="rt-dm-guest@example.com", username="rt.dm.guest")
    auth_client.post("/api/auth/logout")

    _create_friendship(
        auth_client,
        requester_email="rt-dm-owner@example.com",
        recipient_email="rt-dm-guest@example.com",
        recipient_username="rt.dm.guest",
    )
    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="rt-dm-owner@example.com")
    dm_response = auth_client.post("/api/dms", json={"username": "rt.dm.guest"})
    assert dm_response.status_code == 201
    dm_id = dm_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="rt-dm-guest@example.com")

    with auth_client.websocket_connect(f"/ws/conversations/{dm_id}") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "conversation.subscribed"

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="rt-dm-owner@example.com")

        create_response = auth_client.post(
            f"/api/conversations/{dm_id}/messages",
            json={"body_text": "Owner DM message for recipient permissions"},
        )
        assert create_response.status_code == 201

        created_event = websocket.receive_json()
        assert created_event["type"] == "message.created"
        assert created_event["message"]["body_text"] == "Owner DM message for recipient permissions"
        assert created_event["message"]["can_edit"] is False
        assert created_event["message"]["can_delete"] is False


def test_inbox_websocket_streams_friendship_events(auth_client: TestClient) -> None:
    _register_user(auth_client, email="rt-friends-alpha@example.com", username="rt.friends.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="rt-friends-beta@example.com", username="rt.friends.beta")
    auth_client.post("/api/auth/logout")

    _login_user(auth_client, email="rt-friends-beta@example.com")

    with auth_client.websocket_connect("/ws/inbox") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "inbox.subscribed"

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="rt-friends-alpha@example.com")

        create_response = auth_client.post(
            "/api/friends/requests",
            json={
                "username": "rt.friends.beta",
                "message": "Realtime social sync check.",
            },
        )
        assert create_response.status_code == 201

        friendship_event = websocket.receive_json()
        assert friendship_event["type"] == "friendships.updated"


def test_inbox_websocket_streams_room_events(auth_client: TestClient) -> None:
    _register_user(auth_client, email="rt-rooms@example.com", username="rt.rooms")

    with auth_client.websocket_connect("/ws/inbox") as websocket:
        subscribed_event = websocket.receive_json()
        assert subscribed_event["type"] == "inbox.subscribed"

        create_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "realtime-room-admin",
                "description": "Room event test.",
                "visibility": "private",
            },
        )
        assert create_response.status_code == 201

        room_event = websocket.receive_json()
        assert room_event["type"] == "rooms.updated"

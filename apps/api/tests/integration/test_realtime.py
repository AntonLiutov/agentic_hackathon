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

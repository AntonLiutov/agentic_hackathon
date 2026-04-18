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


def test_room_message_lifecycle_and_admin_delete(auth_client: TestClient) -> None:
    _register_user(auth_client, email="room-owner@example.com", username="room.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "message-room",
            "description": "Room for message lifecycle testing.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="room-member@example.com", username="room.member")
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    create_message_response = auth_client.post(
        f"/api/conversations/{room_id}/messages",
        json={
            "body_text": "Hello room,\nthis is the first multiline message.",
        },
    )
    assert create_message_response.status_code == 201
    first_message = create_message_response.json()
    assert first_message["sequence_number"] == 1
    assert first_message["author_username"] == "room.member"
    assert first_message["can_edit"] is True

    reply_message_response = auth_client.post(
        f"/api/conversations/{room_id}/messages",
        json={
            "body_text": "Replying to the first message.",
            "reply_to_message_id": first_message["id"],
        },
    )
    assert reply_message_response.status_code == 201
    reply_message = reply_message_response.json()
    assert reply_message["sequence_number"] == 2
    assert reply_message["reply_to_message"]["id"] == first_message["id"]
    assert reply_message["reply_to_message"]["author_username"] == "room.member"

    edit_response = auth_client.patch(
        f"/api/messages/{first_message['id']}",
        json={"body_text": "Edited first message body."},
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["is_edited"] is True
    assert edit_response.json()["body_text"] == "Edited first message body."

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="room-owner@example.com")

    delete_response = auth_client.delete(f"/api/messages/{reply_message['id']}")
    assert delete_response.status_code == 200
    deleted_message = delete_response.json()
    assert deleted_message["is_deleted"] is True
    assert deleted_message["body_text"] is None
    assert deleted_message["can_edit"] is False

    message_list_response = auth_client.get(f"/api/conversations/{room_id}/messages")
    assert message_list_response.status_code == 200
    payload = message_list_response.json()
    assert payload["sequence_head"] == 2
    assert [message["sequence_number"] for message in payload["messages"]] == [1, 2]
    assert payload["messages"][1]["is_deleted"] is True


def test_room_reply_target_must_stay_in_same_conversation(auth_client: TestClient) -> None:
    _register_user(auth_client, email="multi-owner@example.com", username="multi.owner")
    first_room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "first-message-room",
            "description": "First room",
            "visibility": "public",
        },
    )
    second_room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "second-message-room",
            "description": "Second room",
            "visibility": "public",
        },
    )
    assert first_room_response.status_code == 201
    assert second_room_response.status_code == 201

    first_room_id = first_room_response.json()["id"]
    second_room_id = second_room_response.json()["id"]

    first_message_response = auth_client.post(
        f"/api/conversations/{first_room_id}/messages",
        json={"body_text": "Message in room one."},
    )
    assert first_message_response.status_code == 201

    invalid_reply_response = auth_client.post(
        f"/api/conversations/{second_room_id}/messages",
        json={
            "body_text": "Trying to reply across rooms.",
            "reply_to_message_id": first_message_response.json()["id"],
        },
    )
    assert invalid_reply_response.status_code == 400
    assert (
        invalid_reply_response.json()["detail"]
        == "Reply target must belong to the same conversation."
    )


def test_direct_message_lifecycle_respects_author_permissions(auth_client: TestClient) -> None:
    _register_user(auth_client, email="dm-alpha@example.com", username="dm.alpha")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="dm-beta@example.com", username="dm.beta")
    auth_client.post("/api/auth/logout")

    _login_user(auth_client, email="dm-alpha@example.com")
    dm_response = auth_client.post("/api/dms", json={"username": "dm.beta"})
    assert dm_response.status_code == 201
    dm_id = dm_response.json()["id"]

    author_message_response = auth_client.post(
        f"/api/conversations/{dm_id}/messages",
        json={"body_text": "Hello from alpha."},
    )
    assert author_message_response.status_code == 201
    dm_message_id = author_message_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="dm-beta@example.com")

    unauthorized_edit_response = auth_client.patch(
        f"/api/messages/{dm_message_id}",
        json={"body_text": "Trying to edit another user's DM."},
    )
    assert unauthorized_edit_response.status_code == 403
    assert (
        unauthorized_edit_response.json()["detail"]
        == "Only the message author can edit this message."
    )

    unauthorized_delete_response = auth_client.delete(f"/api/messages/{dm_message_id}")
    assert unauthorized_delete_response.status_code == 403
    assert (
        unauthorized_delete_response.json()["detail"]
        == "You do not have permission to delete this message."
    )

    own_message_response = auth_client.post(
        f"/api/conversations/{dm_id}/messages",
        json={"body_text": "Reply from beta."},
    )
    assert own_message_response.status_code == 201
    assert own_message_response.json()["sequence_number"] == 2

    own_delete_response = auth_client.delete(f"/api/messages/{own_message_response.json()['id']}")
    assert own_delete_response.status_code == 200
    assert own_delete_response.json()["is_deleted"] is True

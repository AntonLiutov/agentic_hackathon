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
    assert payload["oldest_loaded_sequence"] == 1
    assert payload["newest_loaded_sequence"] == 2
    assert payload["next_before_sequence"] is None
    assert payload["has_older"] is False
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

    _create_friendship(
        auth_client,
        requester_email="dm-alpha@example.com",
        recipient_email="dm-beta@example.com",
        recipient_username="dm.beta",
    )
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


def test_message_history_supports_cursor_pagination(auth_client: TestClient) -> None:
    _register_user(auth_client, email="history-owner@example.com", username="history.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "history-room",
            "description": "Room for history pagination testing.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    for index in range(1, 5):
        message_response = auth_client.post(
            f"/api/conversations/{room_id}/messages",
            json={"body_text": f"History message {index}"},
        )
        assert message_response.status_code == 201

    latest_page_response = auth_client.get(
        f"/api/conversations/{room_id}/messages",
        params={"limit": 2},
    )
    assert latest_page_response.status_code == 200
    latest_payload = latest_page_response.json()
    assert latest_payload["sequence_head"] == 4
    assert latest_payload["oldest_loaded_sequence"] == 3
    assert latest_payload["newest_loaded_sequence"] == 4
    assert latest_payload["next_before_sequence"] == 3
    assert latest_payload["has_older"] is True
    assert [message["sequence_number"] for message in latest_payload["messages"]] == [3, 4]

    older_page_response = auth_client.get(
        f"/api/conversations/{room_id}/messages",
        params={"limit": 2, "before_sequence": latest_payload["next_before_sequence"]},
    )
    assert older_page_response.status_code == 200
    older_payload = older_page_response.json()
    assert older_payload["oldest_loaded_sequence"] == 1
    assert older_payload["newest_loaded_sequence"] == 2
    assert older_payload["next_before_sequence"] is None
    assert older_payload["has_older"] is False
    assert [message["sequence_number"] for message in older_payload["messages"]] == [1, 2]


def test_removed_room_member_loses_message_history_access_immediately(
    auth_client: TestClient,
) -> None:
    _register_user(
        auth_client,
        email="ban-owner@example.com",
        username="ban.owner",
    )
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "ban-history-room",
            "description": "Room for revoked-access history checks.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="ban-member@example.com",
        username="ban.member",
    )
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    create_message_response = auth_client.post(
        f"/api/conversations/{room_id}/messages",
        json={"body_text": "Message that should become inaccessible after removal."},
    )
    assert create_message_response.status_code == 201

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="ban-owner@example.com")

    member_lookup_response = auth_client.get(f"/api/rooms/{room_id}/members")
    assert member_lookup_response.status_code == 200
    removable_member = next(
        member
        for member in member_lookup_response.json()["members"]
        if member["username"] == "ban.member"
    )

    remove_member_response = auth_client.delete(
        f"/api/rooms/{room_id}/members/{removable_member['id']}"
    )
    assert remove_member_response.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="ban-member@example.com")

    history_response = auth_client.get(f"/api/conversations/{room_id}/messages")
    assert history_response.status_code == 404
    assert history_response.json()["detail"] == "Conversation not found."

    create_after_removal_response = auth_client.post(
        f"/api/conversations/{room_id}/messages",
        json={"body_text": "Trying to send after removal."},
    )
    assert create_after_removal_response.status_code == 404
    assert create_after_removal_response.json()["detail"] == "Conversation not found."


def test_unread_counts_increment_and_clear_when_conversation_is_opened(
    auth_client: TestClient,
) -> None:
    _register_user(auth_client, email="unread-owner@example.com", username="unread.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "unread-room",
            "description": "Room for unread state testing.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="unread-guest@example.com", username="unread.guest")
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="unread-owner@example.com")
    create_response = auth_client.post(
        f"/api/conversations/{room_id}/messages",
        json={"body_text": "Unread room message"},
    )
    assert create_response.status_code == 201

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="unread-guest@example.com")

    my_rooms_response = auth_client.get("/api/rooms/mine")
    assert my_rooms_response.status_code == 200
    assert my_rooms_response.json()["rooms"][0]["unread_count"] == 1

    mark_read_response = auth_client.post(f"/api/conversations/{room_id}/read")
    assert mark_read_response.status_code == 200
    assert mark_read_response.json()["unread_count"] == 0

    refreshed_rooms_response = auth_client.get("/api/rooms/mine")
    assert refreshed_rooms_response.status_code == 200
    assert refreshed_rooms_response.json()["rooms"][0]["unread_count"] == 0

    auth_client.post("/api/auth/logout")
    _create_friendship(
        auth_client,
        requester_email="unread-owner@example.com",
        recipient_email="unread-guest@example.com",
        recipient_username="unread.guest",
    )

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="unread-owner@example.com")
    dm_response = auth_client.post("/api/dms", json={"username": "unread.guest"})
    assert dm_response.status_code == 201
    dm_id = dm_response.json()["id"]

    dm_message_response = auth_client.post(
        f"/api/conversations/{dm_id}/messages",
        json={"body_text": "Unread direct message"},
    )
    assert dm_message_response.status_code == 201

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="unread-guest@example.com")

    direct_messages_response = auth_client.get("/api/dms/mine")
    assert direct_messages_response.status_code == 200
    assert direct_messages_response.json()["direct_messages"][0]["unread_count"] == 1

    dm_mark_read_response = auth_client.post(f"/api/conversations/{dm_id}/read")
    assert dm_mark_read_response.status_code == 200
    assert dm_mark_read_response.json()["unread_count"] == 0

    refreshed_direct_messages_response = auth_client.get("/api/dms/mine")
    assert refreshed_direct_messages_response.status_code == 200
    assert refreshed_direct_messages_response.json()["direct_messages"][0]["unread_count"] == 0

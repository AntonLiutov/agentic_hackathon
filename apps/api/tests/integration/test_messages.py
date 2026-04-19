from pathlib import Path

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


def test_room_message_supports_attachment_upload_and_download(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="attachment-owner@example.com",
            username="attachment.owner",
        )
        room_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "attachment-room",
                "description": "Room for attachment testing.",
                "visibility": "public",
            },
        )
        assert room_response.status_code == 201
        room_id = room_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{room_id}/messages/attachments",
            data={
                "body_text": "Sharing a preview image.",
                "attachment_comment": "Sprint wireframe snapshot",
            },
            files={
                "files": ("wireframe.png", b"\x89PNG\r\npreview-bytes", "image/png"),
            },
        )
        assert create_message_response.status_code == 201
        message_payload = create_message_response.json()
        assert message_payload["body_text"] == "Sharing a preview image."
        assert len(message_payload["attachments"]) == 1
        attachment = message_payload["attachments"][0]
        assert attachment["original_filename"] == "wireframe.png"
        assert attachment["comment_text"] == "Sprint wireframe snapshot"
        assert attachment["is_image"] is True

        attachment_path = Path(auth_client.app.state.settings.attachments_dir)
        stored_files = list(attachment_path.iterdir())
        assert len(stored_files) == 1
        assert stored_files[0].is_file()

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 200
        assert download_response.headers["content-type"].startswith("image/png")
        assert download_response.content == b"\x89PNG\r\npreview-bytes"

        history_response = auth_client.get(f"/api/conversations/{room_id}/messages")
        assert history_response.status_code == 200
        history_payload = history_response.json()
        assert (
            history_payload["messages"][0]["attachments"][0]["original_filename"]
            == "wireframe.png"
        )
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_direct_message_supports_attachment_upload_and_download(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="dm-attachment-alpha@example.com",
            username="dm.attachment.alpha",
        )
        auth_client.post("/api/auth/logout")
        _register_user(
            auth_client,
            email="dm-attachment-beta@example.com",
            username="dm.attachment.beta",
        )
        auth_client.post("/api/auth/logout")

        _create_friendship(
            auth_client,
            requester_email="dm-attachment-alpha@example.com",
            recipient_email="dm-attachment-beta@example.com",
            recipient_username="dm.attachment.beta",
        )
        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="dm-attachment-alpha@example.com")

        dm_response = auth_client.post(
            "/api/dms",
            json={"username": "dm.attachment.beta"},
        )
        assert dm_response.status_code == 201
        dm_id = dm_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{dm_id}/messages/attachments",
            data={
                "body_text": "Sharing a DM attachment.",
                "attachment_comment": "Private handoff document",
            },
            files={
                "files": ("handoff.pdf", b"%PDF-1.4 dm-preview-bytes", "application/pdf"),
            },
        )
        assert create_message_response.status_code == 201
        message_payload = create_message_response.json()
        assert message_payload["body_text"] == "Sharing a DM attachment."
        assert len(message_payload["attachments"]) == 1
        attachment = message_payload["attachments"][0]
        assert attachment["original_filename"] == "handoff.pdf"
        assert attachment["comment_text"] == "Private handoff document"
        assert attachment["is_image"] is False

        attachment_path = Path(auth_client.app.state.settings.attachments_dir)
        stored_files = list(attachment_path.iterdir())
        assert len(stored_files) == 1
        assert stored_files[0].is_file()

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 200
        assert download_response.headers["content-type"].startswith("application/pdf")
        assert download_response.content == b"%PDF-1.4 dm-preview-bytes"

        history_response = auth_client.get(f"/api/conversations/{dm_id}/messages")
        assert history_response.status_code == 200
        history_payload = history_response.json()
        assert (
            history_payload["messages"][0]["attachments"][0]["original_filename"]
            == "handoff.pdf"
        )
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_attachment_limits_are_enforced(auth_client: TestClient, tmp_path: Path) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(auth_client, email="limit-owner@example.com", username="limit.owner")
        room_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "attachment-limit-room",
                "description": "Room for attachment size validation.",
                "visibility": "public",
            },
        )
        assert room_response.status_code == 201
        room_id = room_response.json()["id"]

        oversized_image = auth_client.post(
            f"/api/conversations/{room_id}/messages/attachments",
            files={
                "files": ("oversized.png", b"0" * (3 * 1024 * 1024 + 1), "image/png"),
            },
        )
        assert oversized_image.status_code == 413
        assert oversized_image.json()["detail"] == "Images must be 3 MB or smaller."
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_room_attachments_require_current_membership(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="room-attachment-owner@example.com",
            username="room.attachment.owner",
        )
        room_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "secured-attachment-room",
                "description": "Room attachment authorization checks.",
                "visibility": "public",
            },
        )
        assert room_response.status_code == 201
        room_id = room_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{room_id}/messages/attachments",
            data={"body_text": "Protected room attachment."},
            files={
                "files": ("secured.pdf", b"%PDF-room-attachment", "application/pdf"),
            },
        )
        assert create_message_response.status_code == 201
        attachment = create_message_response.json()["attachments"][0]

        auth_client.post("/api/auth/logout")
        _register_user(
            auth_client,
            email="room-attachment-outsider@example.com",
            username="room.attachment.outsider",
        )

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 404
        assert download_response.json()["detail"] == "Conversation not found."
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_unauthenticated_attachment_download_is_rejected(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="attachment-auth-owner@example.com",
            username="attachment.auth.owner",
        )
        room_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "unauth-attachment-room",
                "description": "Attachment auth check.",
                "visibility": "public",
            },
        )
        assert room_response.status_code == 201
        room_id = room_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{room_id}/messages/attachments",
            data={"body_text": "Attachment with auth required."},
            files={
                "files": ("protected.txt", b"protected-room-file", "text/plain"),
            },
        )
        assert create_message_response.status_code == 201
        attachment = create_message_response.json()["attachments"][0]

        auth_client.post("/api/auth/logout")
        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 401
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_removed_room_member_loses_attachment_access_but_file_stays_stored(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="room-file-owner@example.com",
            username="room.file.owner",
        )
        room_response = auth_client.post(
            "/api/rooms",
            json={
                "name": "room-file-access-loss",
                "description": "Attachment revocation check.",
                "visibility": "public",
            },
        )
        assert room_response.status_code == 201
        room_id = room_response.json()["id"]

        auth_client.post("/api/auth/logout")
        _register_user(
            auth_client,
            email="room-file-member@example.com",
            username="room.file.member",
        )
        join_response = auth_client.post(f"/api/rooms/{room_id}/join")
        assert join_response.status_code == 200

        create_message_response = auth_client.post(
            f"/api/conversations/{room_id}/messages/attachments",
            data={"body_text": "Attachment uploaded before removal."},
            files={
                "files": ("handoff.txt", b"room-member-secret", "text/plain"),
            },
        )
        assert create_message_response.status_code == 201
        attachment = create_message_response.json()["attachments"][0]

        stored_files = list(Path(auth_client.app.state.settings.attachments_dir).iterdir())
        assert len(stored_files) == 1
        assert stored_files[0].is_file()

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="room-file-owner@example.com")

        member_lookup_response = auth_client.get(f"/api/rooms/{room_id}/members")
        assert member_lookup_response.status_code == 200
        removable_member = next(
            member
            for member in member_lookup_response.json()["members"]
            if member["username"] == "room.file.member"
        )

        remove_member_response = auth_client.delete(
            f"/api/rooms/{room_id}/members/{removable_member['id']}"
        )
        assert remove_member_response.status_code == 200

        assert stored_files[0].exists() is True

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="room-file-member@example.com")

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 404
        assert download_response.json()["detail"] == "Conversation not found."
        assert stored_files[0].exists() is True
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_direct_message_attachments_require_dm_participation(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(auth_client, email="dm-file-alpha@example.com", username="dm.file.alpha")
        auth_client.post("/api/auth/logout")
        _register_user(auth_client, email="dm-file-beta@example.com", username="dm.file.beta")
        auth_client.post("/api/auth/logout")
        _register_user(auth_client, email="dm-file-gamma@example.com", username="dm.file.gamma")
        auth_client.post("/api/auth/logout")

        _create_friendship(
            auth_client,
            requester_email="dm-file-alpha@example.com",
            recipient_email="dm-file-beta@example.com",
            recipient_username="dm.file.beta",
        )
        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="dm-file-alpha@example.com")

        dm_response = auth_client.post("/api/dms", json={"username": "dm.file.beta"})
        assert dm_response.status_code == 201
        dm_id = dm_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{dm_id}/messages/attachments",
            data={"body_text": "Private attachment."},
            files={
                "files": ("dm-secret.pdf", b"%PDF-dm-secret", "application/pdf"),
            },
        )
        assert create_message_response.status_code == 201
        attachment = create_message_response.json()["attachments"][0]

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="dm-file-gamma@example.com")

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 404
        assert download_response.json()["detail"] == "Conversation not found."
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


def test_frozen_direct_message_participants_keep_attachment_access(
    auth_client: TestClient,
    tmp_path: Path,
) -> None:
    original_attachments_dir = auth_client.app.state.settings.attachments_dir
    auth_client.app.state.settings.attachments_dir = str(tmp_path / "attachments")

    try:
        _register_user(
            auth_client,
            email="frozen-attachment-alpha@example.com",
            username="frozen.attachment.alpha",
        )
        auth_client.post("/api/auth/logout")
        _register_user(
            auth_client,
            email="frozen-attachment-beta@example.com",
            username="frozen.attachment.beta",
        )
        auth_client.post("/api/auth/logout")

        _create_friendship(
            auth_client,
            requester_email="frozen-attachment-alpha@example.com",
            recipient_email="frozen-attachment-beta@example.com",
            recipient_username="frozen.attachment.beta",
        )
        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="frozen-attachment-alpha@example.com")

        dm_response = auth_client.post(
            "/api/dms",
            json={"username": "frozen.attachment.beta"},
        )
        assert dm_response.status_code == 201
        dm_id = dm_response.json()["id"]

        create_message_response = auth_client.post(
            f"/api/conversations/{dm_id}/messages/attachments",
            data={"body_text": "History with attachment."},
            files={
                "files": ("frozen-history.png", b"\x89PNG\r\nfrozen-history", "image/png"),
            },
        )
        assert create_message_response.status_code == 201
        attachment = create_message_response.json()["attachments"][0]

        auth_client.post("/api/auth/logout")
        _login_user(auth_client, email="frozen-attachment-beta@example.com")
        block_response = auth_client.post(
            "/api/blocks",
            json={"username": "frozen.attachment.alpha"},
        )
        assert block_response.status_code == 201

        download_response = auth_client.get(attachment["download_path"])
        assert download_response.status_code == 200
        assert download_response.headers["content-type"].startswith("image/png")
        assert download_response.content == b"\x89PNG\r\nfrozen-history"
    finally:
        auth_client.app.state.settings.attachments_dir = original_attachments_dir


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

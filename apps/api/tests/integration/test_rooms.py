import asyncio
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models.conversation import ConversationMember, RoomBan
from app.db.models.identity import User


def _run(coro: object) -> object:
    return asyncio.run(coro)  # type: ignore[arg-type]


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


async def _ban_user_and_remove_membership(
    client: TestClient,
    *,
    room_id: str,
    username: str,
    owner_username: str,
) -> None:
    session_factory = client.app.state.database.session_factory

    async with session_factory() as session:
        room_uuid = UUID(room_id)
        target_user = (
            await session.execute(select(User).where(User.username == username))
        ).scalars().one()
        owner_user = (
            await session.execute(select(User).where(User.username == owner_username))
        ).scalars().one()
        membership = await session.get(
            ConversationMember,
            {
                "conversation_id": room_uuid,
                "user_id": target_user.id,
            },
        )

        if membership is not None:
            await session.delete(membership)

        session.add(
            RoomBan(
                room_conversation_id=room_uuid,
                user_id=target_user.id,
                banned_by_user_id=owner_user.id,
                reason="Manual moderation in integration test.",
            )
        )
        await session.commit()


def test_public_catalog_join_and_owner_leave_rules(auth_client: TestClient) -> None:
    _register_user(
        auth_client,
        email="owner@example.com",
        username="owner.user",
    )

    public_room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "engineering-room",
            "description": "Coordination room for the main launch.",
            "visibility": "public",
        },
    )
    assert public_room_response.status_code == 201
    room_payload = public_room_response.json()
    assert room_payload["name"] == "engineering-room"
    assert room_payload["is_owner"] is True
    assert room_payload["member_count"] == 1

    owner_leave_response = auth_client.post(f"/api/rooms/{room_payload['id']}/leave")
    assert owner_leave_response.status_code == 400
    assert owner_leave_response.json()["detail"] == "Room owners cannot leave their own room."

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="guest@example.com",
        username="guest.user",
    )

    catalog_response = auth_client.get("/api/rooms/public")
    assert catalog_response.status_code == 200
    catalog_rooms = catalog_response.json()["rooms"]
    assert [room["name"] for room in catalog_rooms] == ["engineering-room"]
    assert catalog_rooms[0]["member_count"] == 1
    assert catalog_rooms[0]["is_member"] is False
    assert catalog_rooms[0]["can_join"] is True

    join_response = auth_client.post(f"/api/rooms/{room_payload['id']}/join")
    assert join_response.status_code == 200
    assert join_response.json()["is_member"] is True
    assert join_response.json()["member_count"] == 2

    my_rooms_response = auth_client.get("/api/rooms/mine")
    assert my_rooms_response.status_code == 200
    assert [room["name"] for room in my_rooms_response.json()["rooms"]] == ["engineering-room"]

    leave_response = auth_client.post(f"/api/rooms/{room_payload['id']}/leave")
    assert leave_response.status_code == 200
    assert leave_response.json()["message"] == "You left the room."


def test_private_rooms_stay_hidden_and_invitation_acceptance_works(
    auth_client: TestClient,
) -> None:
    _register_user(
        auth_client,
        email="planner@example.com",
        username="planner.user",
    )

    private_room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "leadership-war-room",
            "description": "Private coordination for the release train.",
            "visibility": "private",
        },
    )
    assert private_room_response.status_code == 201
    room_id = private_room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="invitee@example.com",
        username="invitee.user",
    )

    public_catalog_response = auth_client.get("/api/rooms/public")
    assert public_catalog_response.status_code == 200
    assert public_catalog_response.json()["rooms"] == []

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="planner@example.com")

    invite_response = auth_client.post(
        f"/api/rooms/{room_id}/invitations",
        json={
            "username": "invitee.user",
            "message": "Join the private room for launch planning.",
        },
    )
    assert invite_response.status_code == 201
    assert invite_response.json()["room_name"] == "leadership-war-room"

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="invitee@example.com")

    invitations_response = auth_client.get("/api/rooms/invitations/mine")
    assert invitations_response.status_code == 200
    invitations = invitations_response.json()["invitations"]
    assert len(invitations) == 1
    assert invitations[0]["room_name"] == "leadership-war-room"

    accept_response = auth_client.post(f"/api/rooms/invitations/{invitations[0]['id']}/accept")
    assert accept_response.status_code == 200
    assert accept_response.json()["is_member"] is True
    assert accept_response.json()["visibility"] == "private"

    my_rooms_response = auth_client.get("/api/rooms/mine")
    assert my_rooms_response.status_code == 200
    assert [room["name"] for room in my_rooms_response.json()["rooms"]] == [
        "leadership-war-room"
    ]


def test_banned_user_cannot_rejoin_public_room(auth_client: TestClient) -> None:
    _register_user(
        auth_client,
        email="moderator@example.com",
        username="moderator.user",
    )
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "community-hub",
            "description": "Public room for everybody.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="banned@example.com",
        username="banned.user",
    )
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    _run(
        _ban_user_and_remove_membership(
            auth_client,
            room_id=room_id,
            username="banned.user",
            owner_username="moderator.user",
        )
    )

    rejoin_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert rejoin_response.status_code == 403
    assert rejoin_response.json()["detail"] == "You cannot join this room."

    public_catalog_response = auth_client.get("/api/rooms/public")
    assert public_catalog_response.status_code == 200
    assert public_catalog_response.json()["rooms"][0]["is_banned"] is True

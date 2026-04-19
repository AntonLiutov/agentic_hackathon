import asyncio
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models.conversation import ConversationMember, RoomAdmin, RoomBan
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


def test_room_membership_access_and_admin_removal_rules(auth_client: TestClient) -> None:
    _register_user(
        auth_client,
        email="owner-membership@example.com",
        username="owner.membership",
    )
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "membership-lab",
            "description": "Private room for membership rule testing.",
            "visibility": "private",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="member-one@example.com",
        username="member.one",
    )

    before_invite_room_summary = auth_client.get(f"/api/rooms/{room_id}")
    assert before_invite_room_summary.status_code == 404

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-membership@example.com")

    invite_response = auth_client.post(
        f"/api/rooms/{room_id}/invitations",
        json={
            "username": "member.one",
            "message": "Join the room for membership testing.",
        },
    )
    assert invite_response.status_code == 201

    member_list_response = auth_client.get(f"/api/rooms/{room_id}/members")
    assert member_list_response.status_code == 200
    members = member_list_response.json()["members"]
    assert len(members) == 1
    assert members[0]["username"] == "owner.membership"
    assert members[0]["is_owner"] is True
    assert members[0]["is_admin"] is True
    assert "email" not in members[0]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="member-one@example.com")

    invitations_response = auth_client.get("/api/rooms/invitations/mine")
    assert invitations_response.status_code == 200
    invitation_id = invitations_response.json()["invitations"][0]["id"]

    accept_response = auth_client.post(f"/api/rooms/invitations/{invitation_id}/accept")
    assert accept_response.status_code == 200
    assert accept_response.json()["is_member"] is True

    member_visible_list = auth_client.get(f"/api/rooms/{room_id}/members")
    assert member_visible_list.status_code == 200
    assert [member["username"] for member in member_visible_list.json()["members"]] == [
        "owner.membership",
        "member.one",
    ]

    ban_list_for_regular_member = auth_client.get(f"/api/rooms/{room_id}/bans")
    assert ban_list_for_regular_member.status_code == 403

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-membership@example.com")

    current_members = auth_client.get(f"/api/rooms/{room_id}/members")
    assert current_members.status_code == 200
    removable_member = next(
        member
        for member in current_members.json()["members"]
        if member["username"] == "member.one"
    )
    assert removable_member["can_remove"] is True

    remove_response = auth_client.delete(
        f"/api/rooms/{room_id}/members/{removable_member['id']}"
    )
    assert remove_response.status_code == 200
    assert (
        remove_response.json()["message"]
        == "Member removed from the room and banned from rejoining."
    )

    ban_list_after_removal = auth_client.get(f"/api/rooms/{room_id}/bans")
    assert ban_list_after_removal.status_code == 200
    bans = ban_list_after_removal.json()["bans"]
    assert len(bans) == 1
    assert bans[0]["username"] == "member.one"
    assert "email" not in bans[0]

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="member-one@example.com")

    removed_room_summary = auth_client.get(f"/api/rooms/{room_id}")
    assert removed_room_summary.status_code == 404

    removed_member_list = auth_client.get(f"/api/rooms/{room_id}/members")
    assert removed_member_list.status_code == 404

    removed_my_rooms = auth_client.get("/api/rooms/mine")
    assert removed_my_rooms.status_code == 200
    assert removed_my_rooms.json()["rooms"] == []

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-membership@example.com")

    re_invite_response = auth_client.post(
        f"/api/rooms/{room_id}/invitations",
        json={
            "username": "member.one",
            "message": "Trying to re-invite a removed member.",
        },
    )
    assert re_invite_response.status_code == 403
    assert re_invite_response.json()["detail"] == "This user cannot be invited to the room."


def test_removed_admin_loses_admin_role_after_unban_and_rejoin(auth_client: TestClient) -> None:
    _register_user(
        auth_client,
        email="owner-admin-reset@example.com",
        username="owner.admin.reset",
    )
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "admin-reset-room",
            "description": "Ensure removed admins do not regain authority automatically.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(
        auth_client,
        email="former-admin@example.com",
        username="former.admin",
    )

    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-admin-reset@example.com")

    current_members_response = auth_client.get(f"/api/rooms/{room_id}/members")
    assert current_members_response.status_code == 200
    former_admin = next(
        member
        for member in current_members_response.json()["members"]
        if member["username"] == "former.admin"
    )

    grant_response = auth_client.post(f"/api/rooms/{room_id}/admins/{former_admin['id']}")
    assert grant_response.status_code == 200

    remove_response = auth_client.delete(f"/api/rooms/{room_id}/members/{former_admin['id']}")
    assert remove_response.status_code == 200

    session_factory = auth_client.app.state.database.session_factory
    room_uuid = UUID(room_id)

    async def _assert_admin_membership_removed() -> None:
        async with session_factory() as session:
            admin_membership = await session.get(
                RoomAdmin,
                {
                    "room_conversation_id": room_uuid,
                    "user_id": UUID(former_admin["id"]),
                },
            )
            assert admin_membership is None

    _run(_assert_admin_membership_removed())

    unban_response = auth_client.delete(f"/api/rooms/{room_id}/bans/{former_admin['id']}")
    assert unban_response.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="former-admin@example.com")

    rejoin_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert rejoin_response.status_code == 200
    assert rejoin_response.json()["is_admin"] is False
    assert rejoin_response.json()["can_manage_members"] is False

    my_rooms_response = auth_client.get("/api/rooms/mine")
    assert my_rooms_response.status_code == 200
    room_summary = my_rooms_response.json()["rooms"][0]
    assert room_summary["id"] == room_id
    assert room_summary["is_admin"] is False
    assert room_summary["can_manage_members"] is False


def test_room_admin_management_and_owner_delete_rules(auth_client: TestClient) -> None:
    _register_user(auth_client, email="owner-admin@example.com", username="owner.admin")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "admin-control-room",
            "description": "Room for administration workflows.",
            "visibility": "private",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="admin-candidate@example.com", username="admin.candidate")
    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="member-target@example.com", username="member.target")
    auth_client.post("/api/auth/logout")

    _login_user(auth_client, email="owner-admin@example.com")
    for username in ("admin.candidate", "member.target"):
        invite_response = auth_client.post(
            f"/api/rooms/{room_id}/invitations",
            json={"username": username},
        )
        assert invite_response.status_code == 201

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="admin-candidate@example.com")
    invitation_response = auth_client.get("/api/rooms/invitations/mine")
    admin_invitation_id = invitation_response.json()["invitations"][0]["id"]
    accept_admin_invitation = auth_client.post(
        f"/api/rooms/invitations/{admin_invitation_id}/accept"
    )
    assert accept_admin_invitation.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="member-target@example.com")
    invitation_response = auth_client.get("/api/rooms/invitations/mine")
    member_invitation_id = invitation_response.json()["invitations"][0]["id"]
    accept_member_invitation = auth_client.post(
        f"/api/rooms/invitations/{member_invitation_id}/accept"
    )
    assert accept_member_invitation.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-admin@example.com")
    members_response = auth_client.get(f"/api/rooms/{room_id}/members")
    assert members_response.status_code == 200
    members = members_response.json()["members"]
    admin_candidate = next(
        member for member in members if member["username"] == "admin.candidate"
    )
    member_target = next(member for member in members if member["username"] == "member.target")

    promote_response = auth_client.post(f"/api/rooms/{room_id}/admins/{admin_candidate['id']}")
    assert promote_response.status_code == 200
    assert promote_response.json()["message"] == "Admin access granted."

    invitations_response = auth_client.get(f"/api/rooms/{room_id}/invitations")
    assert invitations_response.status_code == 200

    owner_delete_admin_response = auth_client.delete(
        f"/api/rooms/{room_id}/admins/{admin_candidate['id']}"
    )
    assert owner_delete_admin_response.status_code == 200
    assert owner_delete_admin_response.json()["message"] == "Admin access removed."

    promote_again_response = auth_client.post(
        f"/api/rooms/{room_id}/admins/{admin_candidate['id']}"
    )
    assert promote_again_response.status_code == 200

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="admin-candidate@example.com")

    demote_owner_response = auth_client.delete(
        f"/api/rooms/{room_id}/admins/{room_response.json()['owner_user_id']}"
    )
    assert demote_owner_response.status_code == 400
    assert demote_owner_response.json()["detail"] == "The room owner always keeps admin access."

    remove_admin_response = auth_client.delete(
        f"/api/rooms/{room_id}/admins/{admin_candidate['id']}"
    )
    assert remove_admin_response.status_code == 400
    assert (
        remove_admin_response.json()["detail"]
        == "Use the owner workflow to change your own admin status."
    )

    remove_member_response = auth_client.delete(
        f"/api/rooms/{room_id}/members/{member_target['id']}"
    )
    assert remove_member_response.status_code == 200

    bans_response = auth_client.get(f"/api/rooms/{room_id}/bans")
    assert bans_response.status_code == 200
    assert bans_response.json()["bans"][0]["username"] == "member.target"

    unban_response = auth_client.delete(f"/api/rooms/{room_id}/bans/{member_target['id']}")
    assert unban_response.status_code == 200
    assert unban_response.json()["message"] == "User removed from the room ban list."

    owner_delete_room_response = auth_client.delete(f"/api/rooms/{room_id}")
    assert owner_delete_room_response.status_code == 403

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="owner-admin@example.com")

    delete_room_response = auth_client.delete(f"/api/rooms/{room_id}")
    assert delete_room_response.status_code == 200
    assert delete_room_response.json()["message"] == "Room deleted permanently."

    deleted_room_response = auth_client.get(f"/api/rooms/{room_id}")
    assert deleted_room_response.status_code == 404

from __future__ import annotations

import base64
import math
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import delete, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.attachments.service import delete_attachment_files, ensure_attachments_dir
from app.auth.security import hash_password, normalize_email, normalize_username
from app.core.config import Settings
from app.db.models.conversation import (
    Conversation,
    ConversationMember,
    DmMetadata,
    RoomAdmin,
    RoomBan,
    RoomInvitation,
    RoomMetadata,
)
from app.db.models.enums import (
    ConversationType,
    DmStatus,
    FriendRequestStatus,
    InvitationStatus,
    RoomVisibility,
)
from app.db.models.identity import PasswordResetToken, User, UserCredential, UserSession
from app.db.models.message import Attachment, ConversationRead, Message, MessageAttachment
from app.db.models.social import FriendRequest, Friendship, UserBlock

DEMO_PASSWORD = "demo-chat-pass-2026"
DEMO_EMAIL_DOMAIN = "demo.agentic.chat"
DEMO_USER_PREFIX = "demo."
DEMO_ROOM_PREFIX = "demo-"
SEED_BASE_TIME = datetime(2026, 4, 18, 9, 0, tzinfo=UTC)

_PNG_ATTACHMENT_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9N4rkAAAAASUVORK5CYII="
)
_TEXT_ATTACHMENT_BYTES = (
    b"Agentic Chat demo launch notes\n\n- Rehearse moderation flow\n- Show history paging\n"
)


@dataclass(frozen=True)
class DemoUserDefinition:
    username: str
    bio: str


@dataclass(frozen=True)
class DemoSeedSummary:
    user_count: int
    room_count: int
    dm_count: int
    history_room_message_count: int
    total_message_count: int
    attachments_count: int
    demo_password: str
    history_chunk_size: int
    history_chunk_count: int
    history_insert_duration_seconds: float
    total_duration_seconds: float
    effective_messages_per_second: float


@dataclass(frozen=True)
class MessageSeedStats:
    attachments_count: int
    total_message_count: int
    history_insert_duration_seconds: float


DEMO_USERS: tuple[DemoUserDefinition, ...] = (
    DemoUserDefinition("demo.alice", "Owner and primary moderator for the demo workspace."),
    DemoUserDefinition("demo.bob", "Engineering lead who helps moderate and seed active history."),
    DemoUserDefinition("demo.carol", "Operations contact with an attachment-heavy DM thread."),
    DemoUserDefinition("demo.dave", "Product teammate with unread room history."),
    DemoUserDefinition("demo.erin", "Pending friend request target for contacts demos."),
    DemoUserDefinition("demo.frank", "Blocked user who keeps a preserved frozen DM history."),
    DemoUserDefinition("demo.grace", "Invitee waiting on a private-room invitation."),
    DemoUserDefinition("demo.henry", "Previously removed room member shown in the banned list."),
)


def _ordered_pair(first_id: uuid.UUID, second_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (first_id, second_id) if str(first_id) < str(second_id) else (second_id, first_id)


def _user_email(username: str) -> str:
    return f"{username}@{DEMO_EMAIL_DOMAIN}"


def _write_demo_attachment(
    *,
    settings: Settings,
    storage_key: str,
    payload: bytes,
) -> int:
    ensure_attachments_dir(settings.attachments_dir)
    destination = Path(settings.attachments_dir) / storage_key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    return len(payload)


def _emit_progress(
    progress_callback: Callable[[str], None] | None,
    message: str,
) -> None:
    if progress_callback is not None:
        progress_callback(message)


async def _cleanup_existing_demo_data(db: AsyncSession, *, settings: Settings) -> None:
    demo_emails = [normalize_email(_user_email(definition.username)) for definition in DEMO_USERS]
    demo_user_ids = list(
        (
            await db.execute(
                select(User.id).where(
                    or_(
                        User.username.like(f"{DEMO_USER_PREFIX}%"),
                        User.email.in_(demo_emails),
                    )
                )
            )
        ).scalars()
    )
    demo_room_ids = list(
        (
            await db.execute(
                select(RoomMetadata.conversation_id).where(
                    or_(
                        RoomMetadata.name.like(f"{DEMO_ROOM_PREFIX}%"),
                        RoomMetadata.owner_user_id.in_(demo_user_ids) if demo_user_ids else False,
                    )
                )
            )
        ).scalars()
    )

    demo_dm_ids: list[uuid.UUID] = []
    if demo_user_ids:
        demo_dm_ids = list(
            (
                await db.execute(
                    select(DmMetadata.conversation_id).where(
                        or_(
                            DmMetadata.user_one_id.in_(demo_user_ids),
                            DmMetadata.user_two_id.in_(demo_user_ids),
                        )
                    )
                )
            ).scalars()
        )

    conversation_ids = [*demo_room_ids, *demo_dm_ids]
    if conversation_ids:
        attachment_rows = (
            await db.execute(
                select(Attachment.id, Attachment.storage_key)
                .join(MessageAttachment, MessageAttachment.attachment_id == Attachment.id)
                .join(Message, Message.id == MessageAttachment.message_id)
                .where(Message.conversation_id.in_(conversation_ids))
                .distinct()
            )
        ).all()
        delete_attachment_files(
            settings=settings,
            storage_keys=[storage_key for _, storage_key in attachment_rows],
        )
        attachment_ids = [attachment_id for attachment_id, _ in attachment_rows]

        await db.execute(
            delete(MessageAttachment).where(
                MessageAttachment.message_id.in_(
                    select(Message.id).where(Message.conversation_id.in_(conversation_ids))
                )
            )
        )
        await db.execute(
            delete(ConversationRead).where(ConversationRead.conversation_id.in_(conversation_ids))
        )
        await db.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        if attachment_ids:
            await db.execute(delete(Attachment).where(Attachment.id.in_(attachment_ids)))

    if demo_room_ids:
        await db.execute(
            delete(RoomInvitation).where(
                or_(
                    RoomInvitation.room_conversation_id.in_(demo_room_ids),
                    RoomInvitation.invitee_user_id.in_(demo_user_ids) if demo_user_ids else False,
                    RoomInvitation.inviter_user_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )
        await db.execute(
            delete(RoomBan).where(
                or_(
                    RoomBan.room_conversation_id.in_(demo_room_ids),
                    RoomBan.user_id.in_(demo_user_ids) if demo_user_ids else False,
                    RoomBan.banned_by_user_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )
        await db.execute(
            delete(RoomAdmin).where(
                or_(
                    RoomAdmin.room_conversation_id.in_(demo_room_ids),
                    RoomAdmin.user_id.in_(demo_user_ids) if demo_user_ids else False,
                    RoomAdmin.granted_by_user_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )
        await db.execute(
            delete(RoomMetadata).where(RoomMetadata.conversation_id.in_(demo_room_ids))
        )

    if demo_dm_ids:
        await db.execute(
            delete(DmMetadata).where(
                or_(
                    DmMetadata.conversation_id.in_(demo_dm_ids),
                    DmMetadata.user_one_id.in_(demo_user_ids) if demo_user_ids else False,
                    DmMetadata.user_two_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )

    if conversation_ids:
        await db.execute(
            delete(ConversationMember).where(
                or_(
                    ConversationMember.conversation_id.in_(conversation_ids),
                    ConversationMember.user_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )
        await db.execute(
            delete(Conversation).where(
                or_(
                    Conversation.id.in_(conversation_ids),
                    Conversation.created_by_user_id.in_(demo_user_ids) if demo_user_ids else False,
                )
            )
        )

    if demo_user_ids:
        await db.execute(
            delete(FriendRequest).where(
                or_(
                    FriendRequest.requester_user_id.in_(demo_user_ids),
                    FriendRequest.recipient_user_id.in_(demo_user_ids),
                )
            )
        )
        await db.execute(
            delete(Friendship).where(
                or_(
                    Friendship.user_one_id.in_(demo_user_ids),
                    Friendship.user_two_id.in_(demo_user_ids),
                )
            )
        )
        await db.execute(
            delete(UserBlock).where(
                or_(
                    UserBlock.blocker_user_id.in_(demo_user_ids),
                    UserBlock.blocked_user_id.in_(demo_user_ids),
                )
            )
        )
        await db.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id.in_(demo_user_ids))
        )
        await db.execute(delete(UserSession).where(UserSession.user_id.in_(demo_user_ids)))
        await db.execute(delete(UserCredential).where(UserCredential.user_id.in_(demo_user_ids)))
        await db.execute(delete(User).where(User.id.in_(demo_user_ids)))

    await db.commit()


async def _seed_users(db: AsyncSession, *, settings: Settings) -> dict[str, User]:
    password_hash = hash_password(DEMO_PASSWORD, iterations=settings.password_hash_iterations)
    users: dict[str, User] = {}

    for definition in DEMO_USERS:
        user = User(
            id=uuid.uuid4(),
            username=normalize_username(definition.username),
            email=normalize_email(_user_email(definition.username)),
        )
        users[definition.username] = user
        db.add(user)
        db.add(UserCredential(user_id=user.id, password_hash=password_hash))

    await db.flush()
    return users


async def _seed_friendships_and_blocks(db: AsyncSession, *, users: dict[str, User]) -> None:
    for username_one, username_two in (
        ("demo.alice", "demo.bob"),
        ("demo.alice", "demo.carol"),
        ("demo.bob", "demo.dave"),
        ("demo.alice", "demo.grace"),
    ):
        user_one_id, user_two_id = _ordered_pair(users[username_one].id, users[username_two].id)
        db.add(Friendship(id=uuid.uuid4(), user_one_id=user_one_id, user_two_id=user_two_id))

    db.add(
        FriendRequest(
            id=uuid.uuid4(),
            requester_user_id=users["demo.alice"].id,
            recipient_user_id=users["demo.erin"].id,
            status=FriendRequestStatus.PENDING,
            request_text="Want to connect before the walkthrough?",
        )
    )
    db.add(
        UserBlock(
            id=uuid.uuid4(),
            blocker_user_id=users["demo.alice"].id,
            blocked_user_id=users["demo.frank"].id,
            reason="Frozen DM example for the demo environment.",
        )
    )


async def _create_room(
    db: AsyncSession,
    *,
    users: dict[str, User],
    name: str,
    description: str,
    visibility: RoomVisibility,
    owner_username: str,
    member_usernames: list[str],
    admin_usernames: list[str],
    invitation_usernames: list[str] | None = None,
    banned_usernames: list[tuple[str, str]] | None = None,
) -> Conversation:
    owner = users[owner_username]
    conversation = Conversation(
        id=uuid.uuid4(),
        type=ConversationType.ROOM,
        created_by_user_id=owner.id,
        message_sequence_head=0,
    )
    db.add(conversation)
    db.add(
        RoomMetadata(
            conversation_id=conversation.id,
            name=name,
            description=description,
            visibility=visibility,
            owner_user_id=owner.id,
        )
    )

    seen_members: set[str] = {owner_username, *member_usernames}
    for username in seen_members:
        db.add(
            ConversationMember(
                conversation_id=conversation.id,
                user_id=users[username].id,
            )
        )

    await db.flush()

    db.add(
        RoomAdmin(
            room_conversation_id=conversation.id,
            user_id=owner.id,
            granted_by_user_id=owner.id,
        )
    )
    for username in admin_usernames:
        if username == owner_username:
            continue
        db.add(
            RoomAdmin(
                room_conversation_id=conversation.id,
                user_id=users[username].id,
                granted_by_user_id=owner.id,
            )
        )

    for username in invitation_usernames or []:
        db.add(
            RoomInvitation(
                id=uuid.uuid4(),
                room_conversation_id=conversation.id,
                inviter_user_id=owner.id,
                invitee_user_id=users[username].id,
                status=InvitationStatus.PENDING,
                invitation_text="This private room is ready for your review.",
            )
        )

    for username, reason in banned_usernames or []:
        db.add(
            RoomBan(
                id=uuid.uuid4(),
                room_conversation_id=conversation.id,
                user_id=users[username].id,
                banned_by_user_id=users["demo.bob"].id,
                reason=reason,
            )
        )

    await db.flush()
    return conversation


async def _create_dm(
    db: AsyncSession,
    *,
    users: dict[str, User],
    username_one: str,
    username_two: str,
    initiated_by_username: str,
    status: DmStatus,
) -> Conversation:
    user_one, user_two = _ordered_pair(users[username_one].id, users[username_two].id)
    initiated_by = users[initiated_by_username]
    conversation = Conversation(
        id=uuid.uuid4(),
        type=ConversationType.DM,
        created_by_user_id=initiated_by.id,
        message_sequence_head=0,
    )
    db.add(conversation)
    db.add(
        DmMetadata(
            conversation_id=conversation.id,
            user_one_id=user_one,
            user_two_id=user_two,
            status=status,
            initiated_by_user_id=initiated_by.id,
        )
    )
    db.add(ConversationMember(conversation_id=conversation.id, user_id=users[username_one].id))
    db.add(ConversationMember(conversation_id=conversation.id, user_id=users[username_two].id))
    await db.flush()
    return conversation


async def _insert_small_message_set(
    db: AsyncSession,
    *,
    conversation: Conversation,
    authored_messages: list[dict[str, Any]],
) -> list[Message]:
    rows: list[Message] = []
    for index, payload in enumerate(authored_messages, start=1):
        message = Message(
            conversation_id=conversation.id,
            author_user_id=payload["author_user_id"],
            sequence_number=index,
            body_text=payload.get("body_text"),
            reply_to_message_id=payload.get("reply_to_message_id"),
            created_at=payload["created_at"],
            edited_at=payload.get("edited_at"),
            deleted_at=payload.get("deleted_at"),
        )
        db.add(message)
        rows.append(message)

    conversation.message_sequence_head = len(authored_messages)
    await db.flush()
    return rows


async def _attach_demo_file(
    db: AsyncSession,
    *,
    settings: Settings,
    uploader: User,
    message: Message,
    storage_key: str,
    original_filename: str,
    media_type: str,
    payload: bytes,
    comment_text: str,
) -> None:
    size_bytes = _write_demo_attachment(settings=settings, storage_key=storage_key, payload=payload)
    attachment = Attachment(
        id=uuid.uuid4(),
        storage_key=storage_key,
        original_filename=original_filename,
        media_type=media_type,
        size_bytes=size_bytes,
        uploader_user_id=uploader.id,
        comment_text=comment_text,
    )
    db.add(attachment)
    await db.flush()
    db.add(MessageAttachment(message_id=message.id, attachment_id=attachment.id))


async def _insert_large_history(
    db: AsyncSession,
    *,
    conversation: Conversation,
    author_ids: list[uuid.UUID],
    count: int,
    start_time: datetime,
    label: str,
    chunk_size: int,
    progress_callback: Callable[[str], None] | None = None,
) -> None:
    inserted = 0
    sequence = 1
    total_chunks = math.ceil(count / chunk_size)
    chunk_index = 0
    progress_interval = max(1, total_chunks // 10)
    while inserted < count:
        chunk_index += 1
        current_chunk = min(chunk_size, count - inserted)
        rows = []
        for offset in range(current_chunk):
            message_number = inserted + offset + 1
            rows.append(
                {
                    "conversation_id": conversation.id,
                    "author_user_id": author_ids[(sequence - 1 + offset) % len(author_ids)],
                    "sequence_number": sequence + offset,
                    "body_text": f"{label} message {message_number}: seeded long-history record.",
                    "created_at": start_time + timedelta(seconds=message_number * 20),
                }
            )
        await db.execute(insert(Message), rows)
        inserted += current_chunk
        sequence += current_chunk
        if (
            chunk_index == 1
            or chunk_index == total_chunks
            or chunk_index % progress_interval == 0
        ):
            _emit_progress(
                progress_callback,
                (
                    f"Seeded history chunk {chunk_index}/{total_chunks} "
                    f"({inserted}/{count} messages)."
                ),
            )

    conversation.message_sequence_head = count


async def _seed_messages(
    db: AsyncSession,
    *,
    users: dict[str, User],
    settings: Settings,
    rooms: dict[str, Conversation],
    dms: dict[str, Conversation],
    large_history_count: int,
    history_chunk_size: int,
    progress_callback: Callable[[str], None] | None = None,
) -> MessageSeedStats:
    _emit_progress(progress_callback, "Creating demo room and DM messages.")
    general_messages = await _insert_small_message_set(
        db,
        conversation=rooms["demo-general"],
        authored_messages=[
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": (
                    "Welcome to the public demo room. We use this thread for live walkthroughs."
                ),
                "created_at": SEED_BASE_TIME,
            },
            {
                "author_user_id": users["demo.bob"].id,
                "body_text": (
                    "Engineering is ready to show moderation, history, unread, and attachments."
                ),
                "created_at": SEED_BASE_TIME + timedelta(minutes=2),
                "edited_at": SEED_BASE_TIME + timedelta(minutes=7),
            },
            {
                "author_user_id": users["demo.carol"].id,
                "body_text": "Reminder: there is also a frozen DM example under contacts.",
                "created_at": SEED_BASE_TIME + timedelta(minutes=4),
            },
            {
                "author_user_id": users["demo.dave"].id,
                "body_text": None,
                "created_at": SEED_BASE_TIME + timedelta(minutes=8),
                "deleted_at": SEED_BASE_TIME + timedelta(minutes=9),
            },
        ],
    )
    await _attach_demo_file(
        db,
        settings=settings,
        uploader=users["demo.alice"],
        message=general_messages[0],
        storage_key="demo-general-briefing.txt",
        original_filename="launch-briefing.txt",
        media_type="text/plain",
        payload=_TEXT_ATTACHMENT_BYTES,
        comment_text="Reference notes for the walkthrough.",
    )

    await _insert_small_message_set(
        db,
        conversation=dms["alice-bob"],
        authored_messages=[
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": "Want to rehearse the reviewer flow before the demo?",
                "created_at": SEED_BASE_TIME + timedelta(hours=2),
            },
            {
                "author_user_id": users["demo.bob"].id,
                "body_text": "Yes. I will leave a few messages unread so the badge is visible.",
                "created_at": SEED_BASE_TIME + timedelta(hours=2, minutes=4),
            },
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": "Perfect. Open the history-lab room when you want to show pagination.",
                "created_at": SEED_BASE_TIME + timedelta(hours=2, minutes=7),
            },
        ],
    )
    carol_dm_messages = await _insert_small_message_set(
        db,
        conversation=dms["alice-carol"],
        authored_messages=[
            {
                "author_user_id": users["demo.carol"].id,
                "body_text": (
                    "Sending the tiny image attachment here keeps the DM path populated too."
                ),
                "created_at": SEED_BASE_TIME + timedelta(hours=3),
            },
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": (
                    "Perfect. This thread is good for DM attachment and unread walkthroughs."
                ),
                "created_at": SEED_BASE_TIME + timedelta(hours=3, minutes=6),
            },
        ],
    )
    await _attach_demo_file(
        db,
        settings=settings,
        uploader=users["demo.carol"],
        message=carol_dm_messages[0],
        storage_key="demo-dm-preview.png",
        original_filename="demo-preview.png",
        media_type="image/png",
        payload=_PNG_ATTACHMENT_BYTES,
        comment_text="Tiny image attachment for the DM walkthrough.",
    )

    await _insert_small_message_set(
        db,
        conversation=dms["alice-frank"],
        authored_messages=[
            {
                "author_user_id": users["demo.frank"].id,
                "body_text": "This DM remains visible but frozen after a block.",
                "created_at": SEED_BASE_TIME + timedelta(hours=4),
            },
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": "Good example for the preserved history rule.",
                "created_at": SEED_BASE_TIME + timedelta(hours=4, minutes=5),
            },
        ],
    )

    history_insert_started_at = time.perf_counter()
    _emit_progress(
        progress_callback,
        (
            f"Seeding long history room with {large_history_count} messages "
            f"in chunks of {history_chunk_size}."
        ),
    )
    await _insert_large_history(
        db,
        conversation=rooms["demo-history-lab"],
        author_ids=[users["demo.alice"].id, users["demo.bob"].id, users["demo.carol"].id],
        count=large_history_count,
        start_time=SEED_BASE_TIME - timedelta(days=40),
        label="History lab",
        chunk_size=history_chunk_size,
        progress_callback=progress_callback,
    )
    history_insert_duration_seconds = time.perf_counter() - history_insert_started_at
    _emit_progress(
        progress_callback,
        (
            "Finished long history seeding in "
            f"{round(history_insert_duration_seconds, 3)}s."
        ),
    )

    await _insert_small_message_set(
        db,
        conversation=rooms["demo-leadership"],
        authored_messages=[
            {
                "author_user_id": users["demo.alice"].id,
                "body_text": "This private room shows invitation-only governance.",
                "created_at": SEED_BASE_TIME + timedelta(days=1, hours=3),
            },
            {
                "author_user_id": users["demo.bob"].id,
                "body_text": "Grace still has a pending invitation for this room.",
                "created_at": SEED_BASE_TIME + timedelta(days=1, hours=3, minutes=12),
            },
        ],
    )

    small_message_count = 4 + 3 + 2 + 2 + 2
    return MessageSeedStats(
        attachments_count=2,
        total_message_count=small_message_count + large_history_count,
        history_insert_duration_seconds=history_insert_duration_seconds,
    )


async def _seed_read_state(
    db: AsyncSession,
    *,
    conversation: Conversation,
    user: User,
    last_read_sequence_number: int,
) -> None:
    db.add(
        ConversationRead(
            conversation_id=conversation.id,
            user_id=user.id,
            last_read_sequence_number=last_read_sequence_number,
            last_opened_at=SEED_BASE_TIME + timedelta(days=2),
        )
    )


async def seed_demo_data(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    settings: Settings,
    large_history_count: int = 5_000,
    history_chunk_size: int = 1_000,
    replace: bool = True,
    progress_callback: Callable[[str], None] | None = None,
) -> DemoSeedSummary:
    total_started_at = time.perf_counter()
    async with session_factory() as db:
        if replace:
            _emit_progress(progress_callback, "Removing any existing demo dataset.")
            await _cleanup_existing_demo_data(db, settings=settings)

        _emit_progress(progress_callback, "Creating demo users and credentials.")
        users = await _seed_users(db, settings=settings)
        _emit_progress(
            progress_callback,
            "Creating friendships, pending requests, and block examples.",
        )
        await _seed_friendships_and_blocks(db, users=users)

        _emit_progress(progress_callback, "Creating demo rooms, memberships, and invitations.")
        rooms = {
            "demo-general": await _create_room(
                db,
                users=users,
                name="demo-general",
                description="Public room for the main reviewer walkthrough.",
                visibility=RoomVisibility.PUBLIC,
                owner_username="demo.alice",
                member_usernames=["demo.bob", "demo.carol", "demo.dave"],
                admin_usernames=["demo.bob"],
                banned_usernames=[("demo.henry", "Removed during moderation rehearsal.")],
            ),
            "demo-history-lab": await _create_room(
                db,
                users=users,
                name="demo-history-lab",
                description="Large-history room for pagination and scroll validation.",
                visibility=RoomVisibility.PUBLIC,
                owner_username="demo.bob",
                member_usernames=["demo.alice", "demo.carol"],
                admin_usernames=[],
            ),
            "demo-leadership": await _create_room(
                db,
                users=users,
                name="demo-leadership",
                description="Private room with a pending invitation for governance demos.",
                visibility=RoomVisibility.PRIVATE,
                owner_username="demo.alice",
                member_usernames=["demo.bob"],
                admin_usernames=[],
                invitation_usernames=["demo.grace"],
            ),
        }

        _emit_progress(progress_callback, "Creating demo direct-message conversations.")
        dms = {
            "alice-bob": await _create_dm(
                db,
                users=users,
                username_one="demo.alice",
                username_two="demo.bob",
                initiated_by_username="demo.alice",
                status=DmStatus.ACTIVE,
            ),
            "alice-carol": await _create_dm(
                db,
                users=users,
                username_one="demo.alice",
                username_two="demo.carol",
                initiated_by_username="demo.carol",
                status=DmStatus.ACTIVE,
            ),
            "alice-frank": await _create_dm(
                db,
                users=users,
                username_one="demo.alice",
                username_two="demo.frank",
                initiated_by_username="demo.alice",
                status=DmStatus.FROZEN,
            ),
        }

        message_stats = await _seed_messages(
            db,
            users=users,
            settings=settings,
            rooms=rooms,
            dms=dms,
            large_history_count=large_history_count,
            history_chunk_size=history_chunk_size,
            progress_callback=progress_callback,
        )

        _emit_progress(progress_callback, "Writing unread/read markers for seeded conversations.")
        await _seed_read_state(
            db,
            conversation=rooms["demo-general"],
            user=users["demo.alice"],
            last_read_sequence_number=4,
        )
        await _seed_read_state(
            db,
            conversation=rooms["demo-general"],
            user=users["demo.bob"],
            last_read_sequence_number=2,
        )
        await _seed_read_state(
            db,
            conversation=rooms["demo-history-lab"],
            user=users["demo.alice"],
            last_read_sequence_number=max(0, large_history_count - 15),
        )
        await _seed_read_state(
            db,
            conversation=dms["alice-bob"],
            user=users["demo.bob"],
            last_read_sequence_number=1,
        )

        _emit_progress(progress_callback, "Committing seeded demo data.")
        await db.commit()

    total_duration_seconds = time.perf_counter() - total_started_at
    history_chunk_count = math.ceil(large_history_count / history_chunk_size)
    effective_messages_per_second = (
        message_stats.total_message_count / total_duration_seconds
        if total_duration_seconds > 0
        else 0.0
    )

    return DemoSeedSummary(
        user_count=len(DEMO_USERS),
        room_count=len(rooms),
        dm_count=len(dms),
        history_room_message_count=large_history_count,
        total_message_count=message_stats.total_message_count,
        attachments_count=message_stats.attachments_count,
        demo_password=DEMO_PASSWORD,
        history_chunk_size=history_chunk_size,
        history_chunk_count=history_chunk_count,
        history_insert_duration_seconds=round(
            message_stats.history_insert_duration_seconds, 3
        ),
        total_duration_seconds=round(total_duration_seconds, 3),
        effective_messages_per_second=round(effective_messages_per_second, 2),
    )

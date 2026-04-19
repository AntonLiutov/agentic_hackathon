from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import func, select

import app.db.models  # noqa: F401
from app.attachments.service import get_attachment_path
from app.core.config import Settings
from app.db import Base
from app.db.models.conversation import DmMetadata, RoomInvitation, RoomMetadata
from app.db.models.enums import DmStatus, FriendRequestStatus, RoomVisibility
from app.db.models.identity import User
from app.db.models.message import Attachment, Message
from app.db.models.social import FriendRequest, UserBlock
from app.db.session import DatabaseManager
from app.demo.service import seed_demo_data


def _run(coro: object) -> object:
    return asyncio.run(coro)  # type: ignore[arg-type]


async def _prepare_schema(manager: DatabaseManager) -> None:
    tables = [
        table
        for name, table in Base.metadata.tables.items()
        if name not in {"security_events", "moderation_events"}
    ]

    async with manager.engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(sync_connection, tables=tables)
        )


@pytest.fixture
def demo_seed_environment(tmp_path: Path) -> tuple[DatabaseManager, Settings]:
    database_path = tmp_path / "demo-seed.sqlite3"
    manager = DatabaseManager(f"sqlite+aiosqlite:///{database_path}")
    _run(_prepare_schema(manager))
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{database_path}",
        attachments_dir=str(tmp_path / "attachments"),
    )

    try:
        yield manager, settings
    finally:
        _run(manager.dispose())


def test_demo_seed_creates_reusable_demo_world(
    demo_seed_environment: tuple[DatabaseManager, Settings],
) -> None:
    manager, settings = demo_seed_environment

    first_summary = _run(
        seed_demo_data(
            manager.session_factory,
            settings=settings,
            large_history_count=120,
            history_chunk_size=40,
        )
    )
    assert first_summary.total_message_count == 133
    assert first_summary.history_chunk_size == 40
    assert first_summary.history_chunk_count == 3
    assert first_summary.history_insert_duration_seconds >= 0
    assert first_summary.total_duration_seconds > 0
    assert first_summary.effective_messages_per_second > 0

    async def assert_seed_state() -> None:
        async with manager.session_factory() as db:
            user_count = (
                await db.execute(
                    select(func.count()).select_from(User).where(User.username.like("demo.%"))
                )
            ).scalar_one()
            assert user_count == 8

            room_rows = (
                await db.execute(
                    select(RoomMetadata.name, RoomMetadata.visibility).where(
                        RoomMetadata.name.like("demo-%")
                    )
                )
            ).all()
            assert {name for name, _ in room_rows} == {
                "demo-general",
                "demo-history-lab",
                "demo-leadership",
            }
            assert any(visibility == RoomVisibility.PRIVATE for _, visibility in room_rows)

            history_room_id = (
                await db.execute(
                    select(RoomMetadata.conversation_id).where(
                        RoomMetadata.name == "demo-history-lab"
                    )
                )
            ).scalar_one()
            history_message_count = (
                await db.execute(
                    select(func.count()).select_from(Message).where(
                        Message.conversation_id == history_room_id
                    )
                )
            ).scalar_one()
            assert history_message_count == 120

            pending_invitation_count = (
                await db.execute(select(func.count()).select_from(RoomInvitation))
            ).scalar_one()
            assert pending_invitation_count == 1

            frozen_dm_count = (
                await db.execute(
                    select(func.count()).select_from(DmMetadata).where(
                        DmMetadata.status == DmStatus.FROZEN
                    )
                )
            ).scalar_one()
            assert frozen_dm_count == 1

            attachment_records = list((await db.execute(select(Attachment))).scalars().all())
            assert len(attachment_records) == first_summary.attachments_count
            assert all(
                get_attachment_path(settings=settings, storage_key=attachment.storage_key).exists()
                for attachment in attachment_records
            )

            pending_request_count = (
                await db.execute(
                    select(func.count()).select_from(FriendRequest).where(
                        FriendRequest.status == FriendRequestStatus.PENDING
                    )
                )
            ).scalar_one()
            assert pending_request_count == 1

            block_count = (
                await db.execute(select(func.count()).select_from(UserBlock))
            ).scalar_one()
            assert block_count == 1

    _run(assert_seed_state())

    second_summary = _run(
        seed_demo_data(
            manager.session_factory,
            settings=settings,
            large_history_count=120,
            history_chunk_size=40,
        )
    )
    assert second_summary.user_count == first_summary.user_count
    assert second_summary.room_count == first_summary.room_count
    assert second_summary.dm_count == first_summary.dm_count
    assert second_summary.history_room_message_count == first_summary.history_room_message_count
    assert second_summary.total_message_count == first_summary.total_message_count
    assert second_summary.attachments_count == first_summary.attachments_count
    assert second_summary.demo_password == first_summary.demo_password
    assert second_summary.history_chunk_size == first_summary.history_chunk_size
    assert second_summary.history_chunk_count == first_summary.history_chunk_count
    assert second_summary.history_insert_duration_seconds >= 0
    assert second_summary.total_duration_seconds > 0
    assert second_summary.effective_messages_per_second > 0
    _run(assert_seed_state())

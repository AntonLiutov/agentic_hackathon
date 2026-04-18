from app.db import models as _models  # noqa: F401
from app.db.base import Base


def test_metadata_contains_expected_core_tables() -> None:
    expected_tables = {
        "attachments",
        "conversation_members",
        "conversation_reads",
        "conversations",
        "dm_metadata",
        "friend_requests",
        "friendships",
        "message_attachments",
        "messages",
        "moderation_events",
        "password_reset_tokens",
        "room_admins",
        "room_bans",
        "room_invitations",
        "room_metadata",
        "security_events",
        "user_blocks",
        "user_credentials",
        "user_sessions",
        "users",
    }

    assert expected_tables.issubset(Base.metadata.tables.keys())

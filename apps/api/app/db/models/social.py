from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.enums import FriendRequestStatus, enum_values
from app.db.models.mixins import TimestampMixin


class FriendRequest(TimestampMixin, Base):
    __tablename__ = "friend_requests"
    __table_args__ = (
        CheckConstraint(
            "requester_user_id <> recipient_user_id", name="ck_friend_requests_distinct_users"
        ),
        UniqueConstraint(
            "requester_user_id", "recipient_user_id", name="uq_friend_requests_requester_recipient"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    requester_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[FriendRequestStatus] = mapped_column(
        Enum(FriendRequestStatus, name="friend_request_status", values_callable=enum_values),
        default=FriendRequestStatus.PENDING,
        nullable=False,
    )
    request_text: Mapped[str | None] = mapped_column(Text, nullable=True)


class Friendship(TimestampMixin, Base):
    __tablename__ = "friendships"
    __table_args__ = (
        CheckConstraint("user_one_id <> user_two_id", name="ck_friendships_distinct_users"),
        UniqueConstraint("user_one_id", "user_two_id", name="uq_friendships_user_pair"),
        Index("ix_friendships_user_one_id", "user_one_id"),
        Index("ix_friendships_user_two_id", "user_two_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_one_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_two_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )


class UserBlock(TimestampMixin, Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        CheckConstraint("blocker_user_id <> blocked_user_id", name="ck_user_blocks_distinct_users"),
        UniqueConstraint(
            "blocker_user_id", "blocked_user_id", name="uq_user_blocks_blocker_blocked"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    blocker_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    blocked_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

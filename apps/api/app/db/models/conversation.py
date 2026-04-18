from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.enums import (
    ConversationType,
    DmStatus,
    InvitationStatus,
    RoomVisibility,
    enum_values,
)
from app.db.models.mixins import TimestampMixin


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    type: Mapped[ConversationType] = mapped_column(
        Enum(ConversationType, name="conversation_type", values_callable=enum_values),
        index=True,
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    message_sequence_head: Mapped[int] = mapped_column(
        BigInteger,
        server_default=text("0"),
        nullable=False,
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (Index("ix_conversation_members_user_id", "user_id"),)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class RoomMetadata(TimestampMixin, Base):
    __tablename__ = "room_metadata"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[RoomVisibility] = mapped_column(
        Enum(RoomVisibility, name="room_visibility", values_callable=enum_values),
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )


class RoomAdmin(Base):
    __tablename__ = "room_admins"
    __table_args__ = (Index("ix_room_admins_user_id", "user_id"),)

    room_conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("room_metadata.conversation_id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class RoomBan(TimestampMixin, Base):
    __tablename__ = "room_bans"
    __table_args__ = (
        UniqueConstraint("room_conversation_id", "user_id", name="uq_room_bans_room_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    room_conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("room_metadata.conversation_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    banned_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class RoomInvitation(TimestampMixin, Base):
    __tablename__ = "room_invitations"
    __table_args__ = (
        UniqueConstraint(
            "room_conversation_id", "invitee_user_id", name="uq_room_invitations_room_invitee"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    room_conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("room_metadata.conversation_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    inviter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    invitee_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="invitation_status", values_callable=enum_values),
        default=InvitationStatus.PENDING,
        nullable=False,
    )
    invitation_text: Mapped[str | None] = mapped_column(Text, nullable=True)


class DmMetadata(TimestampMixin, Base):
    __tablename__ = "dm_metadata"
    __table_args__ = (
        CheckConstraint("user_one_id <> user_two_id", name="ck_dm_metadata_distinct_users"),
        UniqueConstraint("user_one_id", "user_two_id", name="uq_dm_metadata_user_pair"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_one_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_two_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[DmStatus] = mapped_column(
        Enum(DmStatus, name="dm_status", values_callable=enum_values),
        default=DmStatus.ACTIVE,
        nullable=False,
    )
    initiated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

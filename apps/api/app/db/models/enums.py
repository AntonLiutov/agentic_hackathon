from enum import Enum


class ConversationType(str, Enum):
    ROOM = "room"
    DM = "dm"


class RoomVisibility(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class DmStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"


class FriendRequestStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    REVOKED = "revoked"


def enum_values(enum_cls: type[Enum]) -> list[str]:
    return [member.value for member in enum_cls]

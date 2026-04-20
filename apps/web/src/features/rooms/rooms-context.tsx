import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSession } from "../session/use-session";
import { getApiErrorMessage } from "../../shared/api/client";
import {
  roomsApi,
  type CreateInvitationPayload,
  type CreateRoomPayload,
  type RoomInvitation,
  type RoomSummary,
} from "../../shared/api/rooms";

type RoomsContextValue = {
  myRooms: RoomSummary[];
  publicRooms: RoomSummary[];
  invitations: RoomInvitation[];
  selectedRoomId: string | null;
  selectedRoom: RoomSummary | null;
  hasExplicitSelection: boolean;
  searchTerm: string;
  isLoading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  totalUnreadCount: number;
  setSearchTerm: (value: string) => void;
  selectRoom: (roomId: string | null) => void;
  refreshRooms: () => Promise<void>;
  createRoom: (payload: CreateRoomPayload) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  inviteToRoom: (roomId: string, payload: CreateInvitationPayload) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  upsertRoom: (room: RoomSummary) => void;
  clearMessages: () => void;
};

export const RoomsContext = createContext<RoomsContextValue | null>(null);
const SELECTED_ROOM_STORAGE_KEY = "agentic_selected_room_id";

function sortRooms(rooms: RoomSummary[]) {
  return [...rooms].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeRoom(room: RoomSummary): RoomSummary {
  return {
    ...room,
    unread_count: room.unread_count ?? 0,
  };
}

function normalizeOpenedRoom(room: RoomSummary): RoomSummary {
  return {
    ...normalizeRoom(room),
    unread_count: 0,
  };
}

export function RoomsProvider({ children }: PropsWithChildren) {
  const { status } = useSession();
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<RoomInvitation[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(SELECTED_ROOM_STORAGE_KEY);
  });
  const [hasExplicitSelection, setHasExplicitSelection] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SELECTED_ROOM_STORAGE_KEY) !== null;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  async function loadRooms(currentSearch: string) {
    if (status === "bootstrapping") {
      setIsLoading(true);
      return;
    }

    if (status === "anonymous") {
      setMyRooms([]);
      setPublicRooms([]);
      setInvitations([]);
      setSelectedRoomId(null);
      setHasExplicitSelection(false);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(SELECTED_ROOM_STORAGE_KEY);
      }
      setErrorMessage(null);
      setNoticeMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [mineResponse, publicResponse, invitationResponse] = await Promise.all([
        roomsApi.listMine(),
        roomsApi.listPublic(currentSearch.trim() ? currentSearch.trim() : undefined),
        roomsApi.listInvitations(),
      ]);

      setMyRooms(sortRooms(mineResponse.rooms.map(normalizeRoom)));
      setPublicRooms(sortRooms(publicResponse.rooms.map(normalizeRoom)));
      setInvitations(invitationResponse.invitations);
      setSelectedRoomId((currentSelection) => {
        if (
          currentSelection &&
          [...mineResponse.rooms, ...publicResponse.rooms].some((room) => room.id === currentSelection)
        ) {
          setHasExplicitSelection(true);
          return currentSelection;
        }

        setHasExplicitSelection(false);
        return mineResponse.rooms[0]?.id ?? publicResponse.rooms[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load rooms right now."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function syncRooms() {
      if (isCancelled) {
        return;
      }

      await loadRooms(searchTerm);
    }

    void syncRooms();

    return () => {
      isCancelled = true;
    };
  }, [status, searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedRoomId) {
      window.localStorage.setItem(SELECTED_ROOM_STORAGE_KEY, selectedRoomId);
      return;
    }

    window.localStorage.removeItem(SELECTED_ROOM_STORAGE_KEY);
  }, [selectedRoomId]);

  const selectedRoom = useMemo(() => {
    const roomPool = [...myRooms, ...publicRooms];
    return roomPool.find((room) => room.id === selectedRoomId) ?? null;
  }, [myRooms, publicRooms, selectedRoomId]);

  const totalUnreadCount = useMemo(
    () =>
      myRooms.reduce((totalUnread, room) => totalUnread + room.unread_count, 0),
    [myRooms],
  );

  const selectRoom = useCallback((roomId: string | null) => {
    setSelectedRoomId(roomId);
    setHasExplicitSelection(roomId !== null);
    setNoticeMessage(null);
    setErrorMessage(null);
  }, []);

  const incrementUnread = useCallback((conversationId: string) => {
    setMyRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === conversationId
          ? {
              ...room,
              unread_count: room.unread_count + 1,
            }
          : room,
      ),
    );
    setPublicRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === conversationId
          ? {
              ...room,
              unread_count: room.unread_count + 1,
            }
          : room,
      ),
    );
  }, []);

  const clearUnread = useCallback((conversationId: string) => {
    setMyRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === conversationId
          ? {
              ...room,
              unread_count: 0,
            }
          : room,
      ),
    );
    setPublicRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === conversationId
          ? {
              ...room,
              unread_count: 0,
            }
          : room,
      ),
    );
  }, []);

  const upsertRoom = useCallback((room: RoomSummary) => {
    const normalizedRoom = normalizeRoom(room);

    if (normalizedRoom.is_member) {
      setMyRooms((currentRooms) => {
        const nextRooms = currentRooms.filter((item) => item.id !== normalizedRoom.id);
        return sortRooms([...nextRooms, normalizedRoom]);
      });
    }

    if (normalizedRoom.visibility === "public") {
      setPublicRooms((currentRooms) => {
        const nextRooms = currentRooms.filter((item) => item.id !== normalizedRoom.id);
        return sortRooms([...nextRooms, normalizedRoom]);
      });
    }
  }, []);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const value = useMemo<RoomsContextValue>(
    () => ({
      myRooms,
      publicRooms,
      invitations,
      selectedRoomId,
      selectedRoom,
      hasExplicitSelection,
      searchTerm,
      isLoading,
      errorMessage,
      noticeMessage,
      totalUnreadCount,
      setSearchTerm,
      selectRoom,
      refreshRooms: async () => {
        await loadRooms(searchTerm);
      },
      createRoom: async (payload) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const room = normalizeOpenedRoom(await roomsApi.create(payload));
        setMyRooms((currentRooms) => sortRooms([...currentRooms, room]));
        if (room.visibility === "public") {
          setPublicRooms((currentRooms) => {
            const nextRooms = currentRooms.filter((item) => item.id !== room.id);
            return sortRooms([...nextRooms, room]);
          });
        }
        setSelectedRoomId(room.id);
        setHasExplicitSelection(true);
        setNoticeMessage(
          room.visibility === "private"
            ? "Private room created. Invite people from the room panel."
            : "Public room created and ready for members.",
        );
      },
      joinRoom: async (roomId) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const joinedRoom = normalizeOpenedRoom(await roomsApi.join(roomId));
        setMyRooms((currentRooms) => {
          const nextRooms = currentRooms.filter((room) => room.id !== joinedRoom.id);
          return sortRooms([...nextRooms, joinedRoom]);
        });
        setPublicRooms((currentRooms) =>
          sortRooms(currentRooms.map((room) => (room.id === joinedRoom.id ? joinedRoom : room))),
        );
        setSelectedRoomId(joinedRoom.id);
        setHasExplicitSelection(true);
        setNoticeMessage(`You joined #${joinedRoom.name}.`);
      },
      leaveRoom: async (roomId) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const room = [...myRooms, ...publicRooms].find((item) => item.id === roomId) ?? null;
        const response = await roomsApi.leave(roomId);
        setMyRooms((currentRooms) => currentRooms.filter((item) => item.id !== roomId));
        if (room && room.visibility === "public") {
          setPublicRooms((currentRooms) =>
            sortRooms(
              currentRooms.map((item) =>
                item.id === roomId
                  ? {
                      ...item,
                      member_count: Math.max(0, item.member_count - 1),
                      is_member: false,
                      can_join: !item.is_banned,
                      can_leave: false,
                      joined_at: null,
                    }
                  : item,
              ),
            ),
          );
        }
        setSelectedRoomId((currentRoomId) => {
          if (currentRoomId !== roomId) {
            return currentRoomId;
          }

          const remainingRooms = myRooms.filter((item) => item.id !== roomId);
          return remainingRooms[0]?.id ?? publicRooms[0]?.id ?? null;
        });
        setHasExplicitSelection(false);
        setNoticeMessage(response.message);
      },
      inviteToRoom: async (roomId, payload) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        await roomsApi.invite(roomId, payload);
        setNoticeMessage(`Invitation sent to ${payload.username}.`);
      },
      acceptInvitation: async (invitationId) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const room = normalizeOpenedRoom(await roomsApi.acceptInvitation(invitationId));
        setInvitations((currentInvitations) =>
          currentInvitations.filter((invitation) => invitation.id !== invitationId),
        );
        setMyRooms((currentRooms) => {
          const nextRooms = currentRooms.filter((item) => item.id !== room.id);
          return sortRooms([...nextRooms, room]);
        });
        setSelectedRoomId(room.id);
        setHasExplicitSelection(true);
        setNoticeMessage(`Invitation accepted. You joined #${room.name}.`);
      },
      incrementUnread,
      clearUnread,
      upsertRoom,
      clearMessages,
    }),
    [
      clearMessages,
      clearUnread,
      errorMessage,
      hasExplicitSelection,
      incrementUnread,
      invitations,
      isLoading,
      myRooms,
      noticeMessage,
      publicRooms,
      searchTerm,
      selectRoom,
      selectedRoom,
      selectedRoomId,
      totalUnreadCount,
      upsertRoom,
    ],
  );

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

import {
  type PropsWithChildren,
  createContext,
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
  searchTerm: string;
  isLoading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  setSearchTerm: (value: string) => void;
  selectRoom: (roomId: string | null) => void;
  refreshRooms: () => Promise<void>;
  createRoom: (payload: CreateRoomPayload) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  inviteToRoom: (roomId: string, payload: CreateInvitationPayload) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  clearMessages: () => void;
};

export const RoomsContext = createContext<RoomsContextValue | null>(null);

function sortRooms(rooms: RoomSummary[]) {
  return [...rooms].sort((left, right) => left.name.localeCompare(right.name));
}

export function RoomsProvider({ children }: PropsWithChildren) {
  const { status } = useSession();
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<RoomInvitation[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  async function loadRooms(currentSearch: string) {
    if (status !== "authenticated") {
      setMyRooms([]);
      setPublicRooms([]);
      setInvitations([]);
      setSelectedRoomId(null);
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

      setMyRooms(sortRooms(mineResponse.rooms));
      setPublicRooms(sortRooms(publicResponse.rooms));
      setInvitations(invitationResponse.invitations);
      setSelectedRoomId((currentSelection) => {
        if (
          currentSelection &&
          [...mineResponse.rooms, ...publicResponse.rooms].some((room) => room.id === currentSelection)
        ) {
          return currentSelection;
        }

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

  const selectedRoom = useMemo(() => {
    const roomPool = [...myRooms, ...publicRooms];
    return roomPool.find((room) => room.id === selectedRoomId) ?? null;
  }, [myRooms, publicRooms, selectedRoomId]);

  const value = useMemo<RoomsContextValue>(
    () => ({
      myRooms,
      publicRooms,
      invitations,
      selectedRoomId,
      selectedRoom,
      searchTerm,
      isLoading,
      errorMessage,
      noticeMessage,
      setSearchTerm,
      selectRoom: (roomId) => {
        setSelectedRoomId(roomId);
        setNoticeMessage(null);
        setErrorMessage(null);
      },
      refreshRooms: async () => {
        await loadRooms(searchTerm);
      },
      createRoom: async (payload) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const room = await roomsApi.create(payload);
        setMyRooms((currentRooms) => sortRooms([...currentRooms, room]));
        if (room.visibility === "public") {
          setPublicRooms((currentRooms) => {
            const nextRooms = currentRooms.filter((item) => item.id !== room.id);
            return sortRooms([...nextRooms, room]);
          });
        }
        setSelectedRoomId(room.id);
        setNoticeMessage(
          room.visibility === "private"
            ? "Private room created. Invite people from the room panel."
            : "Public room created and ready for members.",
        );
      },
      joinRoom: async (roomId) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const joinedRoom = await roomsApi.join(roomId);
        setMyRooms((currentRooms) => {
          const nextRooms = currentRooms.filter((room) => room.id !== joinedRoom.id);
          return sortRooms([...nextRooms, joinedRoom]);
        });
        setPublicRooms((currentRooms) =>
          sortRooms(currentRooms.map((room) => (room.id === joinedRoom.id ? joinedRoom : room))),
        );
        setSelectedRoomId(joinedRoom.id);
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
        const room = await roomsApi.acceptInvitation(invitationId);
        setInvitations((currentInvitations) =>
          currentInvitations.filter((invitation) => invitation.id !== invitationId),
        );
        setMyRooms((currentRooms) => {
          const nextRooms = currentRooms.filter((item) => item.id !== room.id);
          return sortRooms([...nextRooms, room]);
        });
        setSelectedRoomId(room.id);
        setNoticeMessage(`Invitation accepted. You joined #${room.name}.`);
      },
      clearMessages: () => {
        setErrorMessage(null);
        setNoticeMessage(null);
      },
    }),
    [
      errorMessage,
      invitations,
      isLoading,
      myRooms,
      noticeMessage,
      publicRooms,
      searchTerm,
      selectedRoom,
      selectedRoomId,
    ],
  );

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

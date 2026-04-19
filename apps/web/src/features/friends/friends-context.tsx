import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getApiErrorMessage } from "../../shared/api/client";
import {
  friendsApi,
  type CreateFriendRequestPayload,
  type FriendRequestSummary,
  type FriendshipState,
  type FriendSummary,
} from "../../shared/api/friends";
import { useSession } from "../session/use-session";

type FriendsContextValue = {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
  isLoading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  pendingIncomingCount: number;
  refreshFriendships: () => Promise<void>;
  sendFriendRequest: (payload: CreateFriendRequestPayload) => Promise<FriendRequestSummary>;
  acceptFriendRequest: (requestId: string) => Promise<FriendSummary>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendUserId: string) => Promise<void>;
  clearMessages: () => void;
  getFriendshipState: (userId: string) => FriendshipState;
};

export const FriendsContext = createContext<FriendsContextValue | null>(null);

function sortFriends(friends: FriendSummary[]) {
  return [...friends].sort((left, right) => left.username.localeCompare(right.username));
}

export function FriendsProvider({ children }: PropsWithChildren) {
  const { status, user } = useSession();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestSummary[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const loadFriendships = useCallback(async () => {
    if (status !== "authenticated") {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setErrorMessage(null);
      setNoticeMessage(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [friendResponse, requestResponse] = await Promise.all([
        friendsApi.listFriends(),
        friendsApi.listRequests(),
      ]);
      setFriends(sortFriends(friendResponse.friends));
      setIncomingRequests(requestResponse.incoming_requests);
      setOutgoingRequests(requestResponse.outgoing_requests);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load contacts right now."));
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadFriendships();
  }, [loadFriendships]);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const getFriendshipState = useCallback(
    (userId: string): FriendshipState => {
      if (user?.id === userId) {
        return "self";
      }

      if (friends.some((friend) => friend.user_id === userId)) {
        return "friend";
      }

      if (incomingRequests.some((request) => request.requester_user_id === userId)) {
        return "incoming_request";
      }

      if (outgoingRequests.some((request) => request.recipient_user_id === userId)) {
        return "outgoing_request";
      }

      return "none";
    },
    [friends, incomingRequests, outgoingRequests, user?.id],
  );

  const value = useMemo<FriendsContextValue>(
    () => ({
      friends,
      incomingRequests,
      outgoingRequests,
      isLoading,
      errorMessage,
      noticeMessage,
      pendingIncomingCount: incomingRequests.length,
      refreshFriendships: loadFriendships,
      sendFriendRequest: async (payload) => {
        clearMessages();
        const friendRequest = await friendsApi.sendRequest(payload);
        setOutgoingRequests((currentRequests) => [
          friendRequest,
          ...currentRequests.filter((currentRequest) => currentRequest.id !== friendRequest.id),
        ]);
        setNoticeMessage(`Friend request sent to ${friendRequest.recipient_username}.`);
        return friendRequest;
      },
      acceptFriendRequest: async (requestId) => {
        clearMessages();
        const acceptedFriend = await friendsApi.acceptRequest(requestId);
        setFriends((currentFriends) => sortFriends([...currentFriends, acceptedFriend]));
        setIncomingRequests((currentRequests) =>
          currentRequests.filter((currentRequest) => currentRequest.id !== requestId),
        );
        setNoticeMessage(`You are now friends with ${acceptedFriend.username}.`);
        return acceptedFriend;
      },
      rejectFriendRequest: async (requestId) => {
        clearMessages();
        const rejectedRequest = incomingRequests.find((request) => request.id === requestId) ?? null;
        await friendsApi.rejectRequest(requestId);
        setIncomingRequests((currentRequests) =>
          currentRequests.filter((currentRequest) => currentRequest.id !== requestId),
        );
        if (rejectedRequest) {
          setNoticeMessage(`Friend request from ${rejectedRequest.requester_username} rejected.`);
        }
      },
      removeFriend: async (friendUserId) => {
        clearMessages();
        const removedFriend = friends.find((friend) => friend.user_id === friendUserId) ?? null;
        await friendsApi.removeFriend(friendUserId);
        setFriends((currentFriends) =>
          currentFriends.filter((currentFriend) => currentFriend.user_id !== friendUserId),
        );
        if (removedFriend) {
          setNoticeMessage(`${removedFriend.username} removed from your friends list.`);
        }
      },
      clearMessages,
      getFriendshipState,
    }),
    [
      clearMessages,
      errorMessage,
      friends,
      getFriendshipState,
      incomingRequests,
      isLoading,
      loadFriendships,
      noticeMessage,
      outgoingRequests,
    ],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

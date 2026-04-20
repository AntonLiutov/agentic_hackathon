import {
  useCallback,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useFriends } from "../../features/friends/use-friends";
import { useRooms } from "../../features/rooms/use-rooms";
import { usePresence } from "../../features/presence/use-presence";
import { useSession } from "../../features/session/use-session";
import { ApiError, getApiErrorMessage } from "../../shared/api/client";
import { EmojiPicker } from "../../shared/chat/EmojiPicker";
import { appendEmoji } from "../../shared/chat/emoji";
import {
  getAttachmentAssetUrl,
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";
import { useConversationRealtime } from "../../shared/realtime/useConversationRealtime";
import {
  roomsApi,
  type RoomBan,
  type RoomManagementInvitation,
  type RoomMember,
  type RoomVisibility,
} from "../../shared/api/rooms";

type ManageRoomTab = "members" | "admins" | "bans" | "invitations" | "settings";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReplyPreview(message: ConversationMessage) {
  if (!message.reply_to_message) {
    return null;
  }

  if (message.reply_to_message.deleted_at) {
    return `${message.reply_to_message.author_username}: Message deleted`;
  }

  return `${message.reply_to_message.author_username}: ${message.reply_to_message.body_text ?? ""}`;
}

function formatPresenceLabel(presenceStatus: "online" | "afk" | "offline") {
  return presenceStatus === "afk" ? "AFK" : presenceStatus;
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MESSAGE_PAGE_SIZE = 30;

function getAttachmentValidationError(file: File) {
  const isImage = file.type.startsWith("image/");
  const sizeLimit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;

  if (file.size > sizeLimit) {
    return `${file.name} is too large. ${
      isImage ? "Images must be 3 MB or smaller." : "Files must be 20 MB or smaller."
    }`;
  }

  return null;
}

function upsertConversationMessage(
  currentMessages: ConversationMessage[],
  nextMessage: ConversationMessage,
) {
  const mergedMessages = [
    ...currentMessages.filter((message) => message.id !== nextMessage.id),
    nextMessage,
  ];
  mergedMessages.sort((left, right) => left.sequence_number - right.sequence_number);
  return mergedMessages;
}

export function ChatsPage() {
  const { user } = useSession();
  const { getPresence, setMany } = usePresence();
  const { blockUser, getFriendshipState, isUserBlocked, sendFriendRequest } = useFriends();
  const {
    clearUnread,
    hasExplicitSelection,
    inviteToRoom,
    joinRoom,
    leaveRoom,
    refreshRooms,
    selectedRoom,
  } = useRooms();
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bans, setBans] = useState<RoomBan[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [, setSequenceHead] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [composeText, setComposeText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [requestingFriendId, setRequestingFriendId] = useState<string | null>(null);
  const [blockingMemberId, setBlockingMemberId] = useState<string | null>(null);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageRoomTab, setManageRoomTab] = useState<ManageRoomTab>("members");
  const [managementInvitations, setManagementInvitations] = useState<RoomManagementInvitation[]>([]);
  const [isLoadingManagementInvitations, setIsLoadingManagementInvitations] = useState(false);
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  const [demotingAdminId, setDemotingAdminId] = useState<string | null>(null);
  const [unbanningUserId, setUnbanningUserId] = useState<string | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isSavingRoomSettings, setIsSavingRoomSettings] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomDescriptionDraft, setRoomDescriptionDraft] = useState("");
  const [roomVisibilityDraft, setRoomVisibilityDraft] = useState<RoomVisibility>("public");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentComment, setAttachmentComment] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ previousHeight: number; previousTop: number } | null>(
    null,
  );

  const syncRoomPeopleState = useCallback(
    async (activeRoomId: string, canManageMembers: boolean) => {
      const [memberResponse, banResponse] = await Promise.all([
        roomsApi.listMembers(activeRoomId),
        canManageMembers ? roomsApi.listBans(activeRoomId) : Promise.resolve({ bans: [] }),
      ]);

      setMembers(memberResponse.members);
      setBans(banResponse.bans);
    },
    [],
  );

  const syncManagementInvitations = useCallback(async (activeRoomId: string) => {
    const invitationResponse = await roomsApi.listManagementInvitations(activeRoomId);
    setManagementInvitations(invitationResponse.invitations);
  }, []);

  const loadLatestMessages = useCallback(
    async (roomId: string) => {
      const response = await messagesApi.list(roomId, MESSAGE_PAGE_SIZE);
      setMessages(response.messages);
      setSequenceHead(response.sequence_head);
      setHasOlderMessages(response.has_older);
      setNextBeforeSequence(response.next_before_sequence);
      return response;
    },
    [],
  );

  function isNearBottom() {
    const container = messageListRef.current;

    if (!container) {
      return true;
    }

    return container.scrollHeight - (container.scrollTop + container.clientHeight) < 96;
  }

  useLayoutEffect(() => {
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    if (pendingScrollRestoreRef.current) {
      const { previousHeight, previousTop } = pendingScrollRestoreRef.current;
      container.scrollTop = container.scrollHeight - previousHeight + previousTop;
      pendingScrollRestoreRef.current = null;
      return;
    }

    if (shouldAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
      shouldAutoScrollRef.current = false;
    }
  }, [isLoadingMessages, messages]);

  useEffect(() => {
    let isCancelled = false;
    const activeRoomId = selectedRoom?.id;
    const isMember = selectedRoom?.is_member ?? false;
    const canManageMembers = selectedRoom?.can_manage_members ?? false;

    async function loadRoomPeople() {
      if (!activeRoomId || !isMember) {
        setMembers([]);
        setBans([]);
        setManagementInvitations([]);
        setIsLoadingPeople(false);
        return;
      }

      setIsLoadingPeople(true);

      try {
        await syncRoomPeopleState(activeRoomId, canManageMembers);

        if (isCancelled) {
          return;
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await refreshRooms();
          setPanelError("You no longer have access to that room.");
          return;
        }

        setPanelError(getApiErrorMessage(error, "Unable to load room membership right now."));
      } finally {
        if (!isCancelled) {
          setIsLoadingPeople(false);
        }
      }
    }

    void loadRoomPeople();

    return () => {
      isCancelled = true;
    };
  }, [
    refreshRooms,
    selectedRoom?.can_manage_members,
    selectedRoom?.id,
    selectedRoom?.is_member,
    syncRoomPeopleState,
  ]);

  useEffect(() => {
    if (members.length === 0) {
      return;
    }

    setMany(
      members.map((member) => ({
        userId: member.id,
        status: member.presence_status,
      })),
    );
  }, [members, setMany]);

  useEffect(() => {
    let isCancelled = false;

    async function loadManagementInvitations() {
      if (
        !isManageModalOpen ||
        !selectedRoom?.id ||
        !selectedRoom.can_manage_members
      ) {
        if (!isManageModalOpen) {
          setManagementInvitations([]);
        }
        return;
      }

      setIsLoadingManagementInvitations(true);

      try {
        await syncManagementInvitations(selectedRoom.id);
      } catch (error) {
        if (!isCancelled) {
          setPanelError(getApiErrorMessage(error, "Unable to load room invitations right now."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingManagementInvitations(false);
        }
      }
    }

    void loadManagementInvitations();

    return () => {
      isCancelled = true;
    };
  }, [
    isManageModalOpen,
    selectedRoom?.can_manage_members,
    selectedRoom?.id,
    syncManagementInvitations,
  ]);

  useEffect(() => {
    if (!selectedRoom) {
      setRoomNameDraft("");
      setRoomDescriptionDraft("");
      setRoomVisibilityDraft("public");
      setMemberSearchTerm("");
      return;
    }

    setRoomNameDraft(selectedRoom.name);
    setRoomDescriptionDraft(selectedRoom.description ?? "");
    setRoomVisibilityDraft(selectedRoom.visibility);
    setMemberSearchTerm("");
  }, [selectedRoom?.id]);

  useEffect(() => {
    async function handleRoomsUpdated() {
      if (!selectedRoom?.id || !selectedRoom.is_member) {
        return;
      }

      try {
        await loadLatestMessages(selectedRoom.id);
        await syncRoomPeopleState(selectedRoom.id, selectedRoom.can_manage_members);

        if (isManageModalOpen && selectedRoom.can_manage_members) {
          await syncManagementInvitations(selectedRoom.id);
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await refreshRooms();
          setPanelError("You no longer have access to that room.");
          return;
        }

        setPanelError(getApiErrorMessage(error, "Unable to refresh room membership right now."));
      }
    }

    function onRoomsUpdated() {
      void handleRoomsUpdated();
    }

    window.addEventListener("agentic:rooms-updated", onRoomsUpdated);
    return () => {
      window.removeEventListener("agentic:rooms-updated", onRoomsUpdated);
    };
  }, [
    isManageModalOpen,
    loadLatestMessages,
    refreshRooms,
    selectedRoom?.can_manage_members,
    selectedRoom?.id,
    selectedRoom?.is_member,
    syncManagementInvitations,
    syncRoomPeopleState,
  ]);

  useEffect(() => {
    let isCancelled = false;
    const activeRoomId = selectedRoom?.id;
    const isMember = selectedRoom?.is_member ?? false;

    async function loadMessages() {
      if (!activeRoomId || !isMember) {
        setMessages([]);
        setSequenceHead(0);
        setHasOlderMessages(false);
        setNextBeforeSequence(null);
        setReplyTarget(null);
        setEditingMessageId(null);
        setComposeText("");
        setIsLoadingMessages(false);
        return;
      }

      setIsLoadingMessages(true);
      shouldAutoScrollRef.current = true;

      try {
        await loadLatestMessages(activeRoomId);

        if (hasExplicitSelection) {
          await messagesApi.markRead(activeRoomId);
          clearUnread(activeRoomId);
        }

        if (isCancelled) {
          return;
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await refreshRooms();
          setPanelError("You no longer have access to that room.");
          return;
        }

        setPanelError(getApiErrorMessage(error, "Unable to load conversation messages right now."));
      } finally {
        if (!isCancelled) {
          setIsLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [clearUnread, hasExplicitSelection, loadLatestMessages, selectedRoom?.id, selectedRoom?.is_member]);

  async function loadOlderMessages() {
    if (!selectedRoom || !nextBeforeSequence || isLoadingOlderMessages) {
      return;
    }

    const container = messageListRef.current;
    if (container) {
      pendingScrollRestoreRef.current = {
        previousHeight: container.scrollHeight,
        previousTop: container.scrollTop,
      };
    }

    setIsLoadingOlderMessages(true);

    try {
      const response = await messagesApi.list(
        selectedRoom.id,
        MESSAGE_PAGE_SIZE,
        nextBeforeSequence,
      );
      setMessages((currentMessages) => {
        const knownMessageIds = new Set(currentMessages.map((message) => message.id));
        const olderMessages = response.messages.filter((message) => !knownMessageIds.has(message.id));
        return [...olderMessages, ...currentMessages];
      });
      setSequenceHead(response.sequence_head);
      setHasOlderMessages(response.has_older);
      setNextBeforeSequence(response.next_before_sequence);
    } catch (error) {
      pendingScrollRestoreRef.current = null;
      setPanelError(getApiErrorMessage(error, "Unable to load older messages right now."));
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }

  function handleMessageListScroll(event: UIEvent<HTMLDivElement>) {
    if (!hasOlderMessages || isLoadingOlderMessages) {
      return;
    }

    if (event.currentTarget.scrollTop <= 80) {
      void loadOlderMessages();
    }
  }

  function addPendingFiles(nextFiles: File[]) {
    const validationError = nextFiles
      .map((file) => getAttachmentValidationError(file))
      .find((errorMessage) => errorMessage !== null);

    if (validationError) {
      setComposerError(validationError);
    } else {
      setComposerError(null);
    }

    setPendingFiles((currentFiles) => {
      const seen = new Set(currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const uniqueFiles = nextFiles.filter((file) => {
        if (getAttachmentValidationError(file)) {
          return false;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      return [...currentFiles, ...uniqueFiles];
    });
  }

  function handleAttachmentSelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length > 0) {
      addPendingFiles(nextFiles);
    }
    event.target.value = "";
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (editingMessageId !== null) {
      return;
    }

    const clipboardFiles = Array.from(event.clipboardData.files ?? []);
    if (clipboardFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addPendingFiles(clipboardFiles);
  }

  function removePendingFile(fileToRemove: File) {
    setPendingFiles((currentFiles) =>
      currentFiles.filter(
        (file) =>
          !(
            file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified
          ),
      ),
    );
  }

  function resetComposerState() {
    setComposeText("");
    setReplyTarget(null);
    setEditingMessageId(null);
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
    setIsEmojiPickerOpen(false);
  }

  function handleInsertEmoji(emoji: string) {
    setComposeText((currentValue) => appendEmoji(currentValue, emoji));
    setIsEmojiPickerOpen(false);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsSubmittingInvite(true);

    try {
      await inviteToRoom(selectedRoom.id, {
        username: inviteUsername,
        message: inviteMessage.trim() ? inviteMessage : undefined,
      });
      if (selectedRoom.can_manage_members) {
        await syncManagementInvitations(selectedRoom.id);
      }
      setInviteUsername("");
      setInviteMessage("");
      setPanelNotice(`Invitation sent to ${inviteUsername}.`);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to send that invitation right now."));
    } finally {
      setIsSubmittingInvite(false);
    }
  }

  async function handleLeaveRoom() {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsLeavingRoom(true);

    try {
      await leaveRoom(selectedRoom.id);
      setPanelNotice(`You left #${selectedRoom.name}.`);
      resetComposerState();
      setMessages([]);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to leave that room right now."));
    } finally {
      setIsLeavingRoom(false);
    }
  }

  async function handleJoinFromRoomView() {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsJoiningRoom(true);

    try {
      await joinRoom(selectedRoom.id);
      setPanelNotice(`You joined #${selectedRoom.name}.`);
      await refreshRooms();
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to join that room right now."));
    } finally {
      setIsJoiningRoom(false);
    }
  }

  async function handleRemoveMember(member: RoomMember) {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setRemovingMemberId(member.id);

    try {
      const response = await roomsApi.removeMember(selectedRoom.id, member.id);
      setPanelNotice(response.message);
      await refreshRooms();

      const [memberResponse, banResponse] = await Promise.all([
        roomsApi.listMembers(selectedRoom.id),
        selectedRoom.can_manage_members
          ? roomsApi.listBans(selectedRoom.id)
          : Promise.resolve({ bans: [] }),
      ]);

      setMembers(memberResponse.members);
      setBans(banResponse.bans);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to remove that member right now."));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleSaveRoomSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsSavingRoomSettings(true);

    try {
      const updatedRoom = await roomsApi.update(selectedRoom.id, {
        name: roomNameDraft,
        description: roomDescriptionDraft.trim() ? roomDescriptionDraft.trim() : undefined,
        visibility: roomVisibilityDraft,
      });
      await refreshRooms();
      setPanelNotice(`Room settings updated for #${updatedRoom.name}.`);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to save room settings right now."));
    } finally {
      setIsSavingRoomSettings(false);
    }
  }

  async function handlePromoteMember(member: RoomMember) {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setPromotingMemberId(member.id);

    try {
      const response = await roomsApi.grantAdmin(selectedRoom.id, member.id);
      setPanelNotice(response.message);
      await refreshRooms();
      await syncRoomPeopleState(selectedRoom.id, true);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to grant admin access right now."));
    } finally {
      setPromotingMemberId(null);
    }
  }

  async function handleDemoteAdmin(member: RoomMember) {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setDemotingAdminId(member.id);

    try {
      const response = await roomsApi.revokeAdmin(selectedRoom.id, member.id);
      setPanelNotice(response.message);
      await refreshRooms();
      await syncRoomPeopleState(selectedRoom.id, true);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to remove admin access right now."));
    } finally {
      setDemotingAdminId(null);
    }
  }

  async function handleUnbanUser(ban: RoomBan) {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setUnbanningUserId(ban.user_id);

    try {
      const response = await roomsApi.unbanUser(selectedRoom.id, ban.user_id);
      setPanelNotice(response.message);
      await refreshRooms();
      await syncRoomPeopleState(selectedRoom.id, true);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to remove that room ban right now."));
    } finally {
      setUnbanningUserId(null);
    }
  }

  async function handleDeleteRoom() {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsDeletingRoom(true);

    try {
      const response = await roomsApi.deleteRoom(selectedRoom.id);
      setIsManageModalOpen(false);
      setManageRoomTab("members");
      setManagementInvitations([]);
      await refreshRooms();
      setPanelNotice(response.message);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to delete that room right now."));
    } finally {
      setIsDeletingRoom(false);
    }
  }

  async function handleSendFriendRequest(member: RoomMember) {
    setPanelError(null);
    setPanelNotice(null);
    setRequestingFriendId(member.id);

    try {
      await sendFriendRequest({ username: member.username });
      setPanelNotice(`Friend request sent to ${member.username}.`);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to send that friend request right now."));
    } finally {
      setRequestingFriendId(null);
    }
  }

  async function handleBlockMember(member: RoomMember) {
    setPanelError(null);
    setPanelNotice(null);
    setBlockingMemberId(member.id);

    try {
      await blockUser({ username: member.username });
      setPanelNotice(`${member.username} blocked.`);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to block that user right now."));
    } finally {
      setBlockingMemberId(null);
    }
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom) {
      return;
    }

    const normalizedBodyText = composeText.trim();
    const hasAttachments = pendingFiles.length > 0;

    if (editingMessageId !== null && !normalizedBodyText) {
      return;
    }

    if (editingMessageId === null && !normalizedBodyText && !hasAttachments) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsSubmittingMessage(true);
    setComposerError(null);

    try {
      if (editingMessageId !== null) {
        const updatedMessage = await messagesApi.edit(editingMessageId, {
          body_text: normalizedBodyText,
        });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, updatedMessage),
        );
        setPanelNotice("Message updated.");
      } else {
        shouldAutoScrollRef.current = isNearBottom();
        const createdMessage = hasAttachments
          ? await messagesApi.createWithAttachments(selectedRoom.id, {
              body_text: normalizedBodyText || undefined,
              reply_to_message_id: replyTarget?.id,
              attachment_comment: attachmentComment.trim() || undefined,
              files: pendingFiles,
            })
          : await messagesApi.create(selectedRoom.id, {
              body_text: normalizedBodyText,
              reply_to_message_id: replyTarget?.id,
            });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, createdMessage),
        );
        setSequenceHead((currentSequenceHead) =>
          Math.max(currentSequenceHead, createdMessage.sequence_number),
        );
      }

      resetComposerState();
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to save that message right now."));
    } finally {
      setIsSubmittingMessage(false);
    }
  }

  function handleReply(message: ConversationMessage) {
    setEditingMessageId(null);
    setReplyTarget(message);
    setComposeText("");
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
    setPanelError(null);
    setPanelNotice(null);
  }

  function handleEdit(message: ConversationMessage) {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setComposeText(message.body_text ?? "");
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
    setPanelError(null);
    setPanelNotice(null);
  }

  async function handleDelete(message: ConversationMessage) {
    setPanelError(null);
    setPanelNotice(null);
    setUpdatingMessageId(message.id);

    try {
      const deletedMessage = await messagesApi.delete(message.id);
      setMessages((currentMessages) =>
        upsertConversationMessage(currentMessages, deletedMessage),
      );

      if (editingMessageId === message.id || replyTarget?.id === message.id) {
        resetComposerState();
      }
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to delete that message right now."));
    } finally {
      setUpdatingMessageId(null);
    }
  }

  const realtime = useConversationRealtime({
    conversationId: selectedRoom?.is_member ? selectedRoom.id : null,
    enabled: Boolean(selectedRoom?.is_member),
    onMessageCreated: useCallback(
      (message, liveSequenceHead) => {
        shouldAutoScrollRef.current = isNearBottom();

        setMessages((currentMessages) => {
          const newestLoadedSequence = currentMessages[currentMessages.length - 1]?.sequence_number ?? 0;

          if (
            newestLoadedSequence > 0 &&
            message.sequence_number > newestLoadedSequence + 1 &&
            selectedRoom?.id
          ) {
            shouldAutoScrollRef.current = false;
            void loadLatestMessages(selectedRoom.id);
            return currentMessages;
          }

          return upsertConversationMessage(currentMessages, message);
        });
        setSequenceHead((currentSequenceHead) =>
          Math.max(currentSequenceHead, liveSequenceHead ?? message.sequence_number),
        );
        if (
          hasExplicitSelection &&
          message.author_user_id &&
          message.author_user_id !== user?.id &&
          selectedRoom?.id
        ) {
          void messagesApi.markRead(selectedRoom.id).then(() => {
            clearUnread(selectedRoom.id);
          });
        }
      },
      [clearUnread, hasExplicitSelection, loadLatestMessages, selectedRoom?.id, user?.id],
    ),
    onMessageUpdated: useCallback((message) => {
      setMessages((currentMessages) => {
        if (!currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
          return currentMessages;
        }

        return upsertConversationMessage(currentMessages, message);
      });
    }, []),
    onMessageDeleted: useCallback((message) => {
      setMessages((currentMessages) => {
        if (!currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
          return currentMessages;
        }

        return upsertConversationMessage(currentMessages, message);
      });
    }, []),
    onConnected: useCallback(() => {
      if (!selectedRoom?.id || !selectedRoom.is_member) {
        return;
      }

      void refreshRooms();
      void loadLatestMessages(selectedRoom.id);
      void syncRoomPeopleState(selectedRoom.id, selectedRoom.can_manage_members);
      if (selectedRoom.can_manage_members) {
        void syncManagementInvitations(selectedRoom.id);
      }
    }, [
      loadLatestMessages,
      refreshRooms,
      selectedRoom?.can_manage_members,
      selectedRoom?.id,
      selectedRoom?.is_member,
      syncManagementInvitations,
      syncRoomPeopleState,
    ]),
  });

  const adminMembers = members.filter((member) => member.is_admin);
  const filteredMembers = members.filter((member) =>
    member.username.toLowerCase().includes(memberSearchTerm.trim().toLowerCase()),
  );
  const canShowManageRoom = selectedRoom?.can_manage_members ?? false;

  if (!selectedRoom) {
    return (
      <section className="chat-workspace card">
        <header className="chat-header">
          <h1>Choose a room</h1>
          <p>Open a room from the sidebar to start chatting.</p>
        </header>

        <div className="feature-list">
          <li>Create a room, join a public room, or accept an invitation.</li>
          <li>Messages, replies, and files appear here once you open a conversation.</li>
        </div>
      </section>
    );
  }

  if (!selectedRoom.is_member) {
    if (selectedRoom.is_banned) {
      return (
        <section className="chat-workspace card">
          <header className="chat-header">
            <h1>Room access changed</h1>
            <p>Choose another room from the sidebar to continue.</p>
          </header>

          {panelError ? <p className="auth-error">{panelError}</p> : null}
          {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

          <div className="feature-list">
            <li>You no longer have access to this room.</li>
          </div>
        </section>
      );
    }

    return (
      <section className="chat-workspace card">
        <header className="chat-header room-header">
          <div>
            <h1>#{selectedRoom.name}</h1>
            {selectedRoom.description ? <p>{selectedRoom.description}</p> : null}
          </div>

          <div className="room-header-actions">
            <span className="status-pill status-pill--neutral">{selectedRoom.visibility}</span>
            <span className="status-pill status-pill--neutral">
              {selectedRoom.member_count} member{selectedRoom.member_count === 1 ? "" : "s"}
            </span>
          </div>
        </header>

        {panelError ? <p className="auth-error">{panelError}</p> : null}
        {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

        <article className="session-card">
          <h2>{selectedRoom.is_banned ? "Access revoked" : "Join required"}</h2>
          <p>
            {selectedRoom.is_banned
              ? "This account no longer has access to the room."
              : "Join this room to send messages and share files."}
          </p>
          {selectedRoom.can_join ? (
            <button
              className="primary-button"
              type="button"
              disabled={isJoiningRoom}
              onClick={() => {
                void handleJoinFromRoomView();
              }}
            >
              {isJoiningRoom ? "Joining..." : "Join room"}
            </button>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <section className="chat-workspace card chat-workspace--conversation">
      <header className="chat-header conversation-header conversation-header--room">
        <div className="conversation-header-main">
          <h1>#{selectedRoom.name}</h1>
          {selectedRoom.description ? (
            <p className="conversation-description">{selectedRoom.description}</p>
          ) : null}
          <div className="conversation-meta-row">
            <span
              className="conversation-meta-chip"
              title={selectedRoom.visibility === "private" ? "Private room" : "Public room"}
            >
              <span aria-hidden="true">{selectedRoom.visibility === "private" ? "🔒" : "🌐"}</span>
              {selectedRoom.visibility === "private" ? "Private" : "Public"}
            </span>
            <span
              className="conversation-meta-chip"
              title={`${selectedRoom.member_count} member${selectedRoom.member_count === 1 ? "" : "s"}`}
            >
              <span aria-hidden="true">👥</span>
              {selectedRoom.member_count}
            </span>
            <span
              className="conversation-meta-chip"
              title={realtime.status === "live" ? "Live updates" : "Sync status"}
            >
              <span
                className={
                  realtime.status === "live"
                    ? "conversation-live-dot conversation-live-dot--live"
                    : "conversation-live-dot conversation-live-dot--syncing"
                }
              />
              {realtime.status === "live"
                ? "Live"
                : realtime.status === "reconnecting"
                  ? "Syncing"
                  : "Connecting"}
            </span>
          </div>
        </div>

        <div className="conversation-header-actions">
          {canShowManageRoom ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setManageRoomTab("members");
                setIsManageModalOpen(true);
              }}
            >
              Manage room
            </button>
          ) : null}
          {selectedRoom.can_leave ? (
            <button
              className="ghost-button"
              type="button"
              disabled={isLeavingRoom}
              onClick={() => {
                void handleLeaveRoom();
              }}
            >
              {isLeavingRoom ? "Leaving..." : "Leave room"}
            </button>
          ) : null}
        </div>
      </header>

      {panelError ? <p className="auth-error">{panelError}</p> : null}
      {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

      {isManageModalOpen && canShowManageRoom ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-room-title"
        >
          <div className="modal-card">
            <header className="modal-header">
              <div>
                <p className="session-card-kicker">Manage room</p>
                <h2 id="manage-room-title">#{selectedRoom.name}</h2>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setIsManageModalOpen(false);
                }}
              >
                Close
              </button>
            </header>

            <div className="modal-tabs" role="tablist" aria-label="Manage room sections">
              {[
                ["members", "Members"],
                ["admins", "Admins"],
                ["bans", "Banned users"],
                ["invitations", "Invitations"],
                ["settings", "Settings"],
              ].map(([tabId, label]) => (
                <button
                  key={tabId}
                  className={manageRoomTab === tabId ? "modal-tab is-active" : "modal-tab"}
                  type="button"
                  role="tab"
                  aria-selected={manageRoomTab === tabId}
                  onClick={() => {
                    setManageRoomTab(tabId as ManageRoomTab);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {manageRoomTab === "members" ? (
                <div className="modal-section">
                  <div className="modal-section-header">
                    <div>
                      <p className="session-card-kicker">Members</p>
                      <h3>Members</h3>
                    </div>
                    <span className="sidebar-muted">{members.length}</span>
                  </div>
                  <label className="auth-form manage-room-search">
                    <span>Search member</span>
                    <input
                      type="search"
                      placeholder="Search member"
                      value={memberSearchTerm}
                      onChange={(event) => setMemberSearchTerm(event.target.value)}
                    />
                  </label>
                  {filteredMembers.length === 0 ? (
                    <p>No room members match that search.</p>
                  ) : (
                    <ul className="room-people-list">
                      {filteredMembers.map((member) => (
                      <li key={member.id} className="room-people-item room-people-item--member">
                        <div className="room-person-summary">
                          <strong>{member.username}</strong>
                          <small className="presence-meta">
                            <span>
                              {member.is_owner ? "Owner" : member.is_admin ? "Admin" : "Member"}
                            </span>
                            <span className="presence-inline">
                              <span
                                className={`presence-dot presence-dot--${
                                  getPresence(member.id) ?? member.presence_status ?? "offline"
                                }`}
                              />
                              {formatPresenceLabel(
                                getPresence(member.id) ?? member.presence_status ?? "offline",
                              )}
                            </span>
                          </small>
                        </div>
                        <div className="room-member-actions">
                          {!member.is_owner && !member.is_admin && selectedRoom.is_owner ? (
                            <button
                              className="ghost-button sidebar-action-button"
                              type="button"
                              disabled={promotingMemberId === member.id}
                              onClick={() => {
                                void handlePromoteMember(member);
                              }}
                            >
                              {promotingMemberId === member.id ? "Saving..." : "Make admin"}
                            </button>
                          ) : null}
                          {member.can_remove ? (
                            <button
                              className="ghost-button sidebar-action-button"
                              type="button"
                              disabled={removingMemberId === member.id}
                              onClick={() => {
                                void handleRemoveMember(member);
                              }}
                            >
                              {removingMemberId === member.id ? "Removing..." : "Remove from room"}
                            </button>
                          ) : null}
                        </div>
                      </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {manageRoomTab === "admins" ? (
                <div className="modal-section">
                  <div className="modal-section-header">
                    <div>
                      <p className="session-card-kicker">Admins</p>
                      <h3>Admins</h3>
                    </div>
                    <span className="sidebar-muted">{adminMembers.length}</span>
                  </div>
                  <ul className="room-people-list">
                    {adminMembers.map((member) => (
                      <li key={member.id} className="room-people-item room-people-item--member">
                        <div className="room-person-summary">
                          <strong>{member.username}</strong>
                          <small>{member.is_owner ? "Owner and permanent admin" : "Room admin"}</small>
                        </div>
                        <div className="room-member-actions">
                          {!member.is_owner && member.id !== user?.id ? (
                            <button
                              className="ghost-button sidebar-action-button"
                              type="button"
                              disabled={demotingAdminId === member.id}
                              onClick={() => {
                                void handleDemoteAdmin(member);
                              }}
                            >
                              {demotingAdminId === member.id ? "Saving..." : "Remove admin"}
                            </button>
                          ) : (
                            <span className="sidebar-muted">Owner rights cannot be removed</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {manageRoomTab === "bans" ? (
                <div className="modal-section">
                  <div className="modal-section-header">
                    <div>
                      <p className="session-card-kicker">Banned users</p>
                      <h3>Banned users</h3>
                    </div>
                    <span className="sidebar-muted">{bans.length}</span>
                  </div>
                  {bans.length === 0 ? (
                    <p>No banned users in this room right now.</p>
                  ) : (
                    <ul className="room-people-list">
                      {bans.map((ban) => (
                        <li key={ban.id} className="room-people-item room-people-item--member">
                          <div className="room-person-summary">
                            <strong>{ban.username}</strong>
                            <small>
                              {ban.banned_by_username ? `By ${ban.banned_by_username}` : "Admin action"}
                            </small>
                            <small>{formatDateTime(ban.banned_at)}</small>
                            <small>{ban.reason ?? "Removed by a room admin."}</small>
                          </div>
                          <div className="room-member-actions">
                            <button
                              className="ghost-button sidebar-action-button"
                              type="button"
                              disabled={unbanningUserId === ban.user_id}
                              onClick={() => {
                                void handleUnbanUser(ban);
                              }}
                            >
                              {unbanningUserId === ban.user_id ? "Saving..." : "Unban"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {manageRoomTab === "invitations" ? (
                <div className="modal-section">
                  <div className="modal-section-header">
                    <div>
                      <p className="session-card-kicker">Invitations</p>
                      <h3>Invitations</h3>
                    </div>
                    <span className="sidebar-muted">{managementInvitations.length}</span>
                  </div>
                  {selectedRoom.visibility === "private" ? (
                    <form className="auth-form" onSubmit={handleInvite}>
                      <label>
                        <span>Username</span>
                        <input
                          type="text"
                          placeholder="alice"
                          value={inviteUsername}
                          onChange={(event) => setInviteUsername(event.target.value)}
                          minLength={3}
                          maxLength={64}
                          required
                        />
                      </label>
                      <label>
                        <span>Message</span>
                        <input
                          type="text"
                          placeholder="Optional invitation note"
                          value={inviteMessage}
                          onChange={(event) => setInviteMessage(event.target.value)}
                          maxLength={500}
                        />
                      </label>
                      <button className="primary-button" type="submit" disabled={isSubmittingInvite}>
                        {isSubmittingInvite ? "Sending invitation..." : "Invite user"}
                      </button>
                    </form>
                  ) : (
                    <p>Public rooms do not use invitation-based access.</p>
                  )}
                  {isLoadingManagementInvitations ? (
                    <p>Loading room invitations...</p>
                  ) : managementInvitations.length === 0 ? (
                    <p>No room invitations have been issued yet.</p>
                  ) : (
                    <ul className="room-people-list">
                      {managementInvitations.map((invitation) => (
                        <li key={invitation.id} className="room-people-item room-people-item--member">
                          <div className="room-person-summary">
                            <strong>{invitation.invitee_username}</strong>
                            <small>{invitation.status}</small>
                            <small>{invitation.message ?? "No invitation note."}</small>
                          </div>
                          <span className="sidebar-muted">
                            {invitation.inviter_username ?? "Unknown inviter"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {manageRoomTab === "settings" ? (
                <div className="modal-section">
                  <div className="modal-section-header">
                    <div>
                      <p className="session-card-kicker">Settings</p>
                      <h3>Settings</h3>
                    </div>
                  </div>
                  <form className="auth-form" onSubmit={handleSaveRoomSettings}>
                    <label>
                      <span>Room name</span>
                      <input
                        type="text"
                        minLength={3}
                        maxLength={120}
                        required
                        value={roomNameDraft}
                        onChange={(event) => setRoomNameDraft(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        rows={4}
                        maxLength={500}
                        placeholder="Describe what this room is for"
                        value={roomDescriptionDraft}
                        onChange={(event) => setRoomDescriptionDraft(event.target.value)}
                      />
                    </label>
                    <fieldset className="visibility-fieldset">
                      <legend>Visibility</legend>
                      <label className="visibility-option">
                        <input
                          type="radio"
                          name="room-visibility"
                          checked={roomVisibilityDraft === "public"}
                          onChange={() => setRoomVisibilityDraft("public")}
                        />
                        <span>Public</span>
                      </label>
                      <label className="visibility-option">
                        <input
                          type="radio"
                          name="room-visibility"
                          checked={roomVisibilityDraft === "private"}
                          onChange={() => setRoomVisibilityDraft("private")}
                        />
                        <span>Private</span>
                      </label>
                    </fieldset>
                    <div className="modal-settings-actions">
                      <button className="primary-button" type="submit" disabled={isSavingRoomSettings}>
                        {isSavingRoomSettings ? "Saving changes..." : "Save changes"}
                      </button>
                    </div>
                  </form>
                  {selectedRoom.is_owner ? (
                    <div className="danger-zone">
                      <p>
                        Deleting the room permanently removes its messages and future governance state.
                      </p>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={isDeletingRoom}
                        onClick={() => {
                          void handleDeleteRoom();
                        }}
                      >
                        {isDeletingRoom ? "Deleting room..." : "Delete room"}
                      </button>
                    </div>
                  ) : (
                    <p className="sidebar-muted">
                      Only the room owner can delete the room.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="chat-room-layout">
        <div className="chat-room-main chat-room-main--thread">
          {isLoadingMessages ? (
            <p>Loading messages...</p>
          ) : messages.length === 0 ? (
            <div className="feature-list">
              <li>This room has no messages yet.</li>
              <li>Send the first message, reply to it, and edit or delete it from the message list.</li>
            </div>
          ) : (
            <div
              ref={messageListRef}
              className="message-list message-list--scrollable"
              onScroll={handleMessageListScroll}
            >
              {hasOlderMessages ? (
                <div className="message-history-banner">
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={isLoadingOlderMessages}
                    onClick={() => {
                      void loadOlderMessages();
                    }}
                  >
                    {isLoadingOlderMessages ? "Loading..." : "Older messages"}
                  </button>
                </div>
              ) : null}
              {messages.map((message) => (
                <article key={message.id} className="message-card">
                  {message.reply_to_message ? (
                    <div className="message-reply-reference">
                      <strong>Replying to</strong>
                      <p>{getReplyPreview(message)}</p>
                    </div>
                  ) : null}
                  <header>
                    <strong>{message.author_username}</strong>
                    <div className="message-meta">
                      <time>{formatMessageTime(message.created_at)}</time>
                      {message.is_edited ? <span className="message-flag">edited</span> : null}
                    </div>
                  </header>
                  <p className={message.is_deleted ? "message-body message-body--deleted" : "message-body"}>
                    {message.is_deleted ? "Message deleted." : message.body_text}
                  </p>
                  {!message.is_deleted && (message.attachments ?? []).length > 0 ? (
                    <div className="message-attachments">
                      {(message.attachments ?? []).map((attachment) => (
                        <article key={attachment.id} className="message-attachment-card">
                          {attachment.is_image ? (
                            <img
                              className="message-attachment-preview"
                              src={getAttachmentAssetUrl(attachment.content_path)}
                              alt={attachment.original_filename}
                              loading="lazy"
                            />
                          ) : null}
                          <div className="message-attachment-meta">
                            <div className="message-attachment-summary">
                              <strong className="message-attachment-name">
                                {attachment.original_filename}
                              </strong>
                              <small>{formatAttachmentSize(attachment.size_bytes)}</small>
                              {attachment.comment_text ? <p>{attachment.comment_text}</p> : null}
                            </div>
                            <a
                              className="ghost-button ghost-button--link"
                              href={getAttachmentAssetUrl(attachment.download_path)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {!message.is_deleted ? (
                    <div className="message-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => handleReply(message)}
                      >
                        Reply
                      </button>
                      {message.can_edit ? (
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => handleEdit(message)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {message.can_delete ? (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={updatingMessageId === message.id}
                          onClick={() => {
                            void handleDelete(message);
                          }}
                        >
                          {updatingMessageId === message.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          <footer className="composer-shell composer-shell--compact">
            <form className="composer-form" onSubmit={handleSubmitMessage}>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                hidden
                onChange={handleAttachmentSelection}
              />
              <div className="composer-toolbar composer-toolbar--compact">
                <button
                  className="composer-icon-button"
                  type="button"
                  aria-label="Emoji"
                  title="Emoji"
                  onClick={() => setIsEmojiPickerOpen((currentValue) => !currentValue)}
                >
                  😊
                </button>
                <button
                  className="composer-icon-button"
                  type="button"
                  aria-label="Attach"
                  title="Attach"
                  disabled={editingMessageId !== null}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  📎
                </button>
                {editingMessageId !== null ? (
                  <span className="composer-toolbar-note">Editing message</span>
                ) : null}
              </div>
              {isEmojiPickerOpen ? <EmojiPicker onSelect={handleInsertEmoji} /> : null}
              {composerError ? <p className="composer-feedback composer-feedback--error">{composerError}</p> : null}
              {replyTarget ? (
                <div className="composer-context-banner">
                  <span>Replying to {replyTarget.author_username}</span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setReplyTarget(null)}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              {editingMessageId !== null ? (
                <div className="composer-context-banner">
                  <span>Editing message #{editingMessageId}</span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => resetComposerState()}
                  >
                    Cancel edit
                  </button>
                </div>
              ) : null}
              {pendingFiles.length > 0 ? (
                <div className="composer-attachments">
                  <div className="composer-attachments-header">
                    <strong>Attachments</strong>
                    <span>{pendingFiles.length} selected</span>
                  </div>
                  <ul className="composer-attachment-list">
                    {pendingFiles.map((file) => (
                      <li key={`${file.name}:${file.size}:${file.lastModified}`} className="composer-attachment-item">
                        <div>
                          <strong>{file.name}</strong>
                          <small>{formatAttachmentSize(file.size)}</small>
                        </div>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => removePendingFile(file)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Optional attachment comment"
                    value={attachmentComment}
                    onChange={(event) => setAttachmentComment(event.target.value)}
                  />
                </div>
              ) : null}
              <textarea
                rows={3}
                maxLength={3072}
                placeholder="Write a message"
                value={composeText}
                onChange={(event) => setComposeText(event.target.value)}
                onPaste={handleComposerPaste}
              />
              <div className="composer-actions composer-actions--compact">
                <button className="ghost-button" type="button" onClick={() => resetComposerState()}>
                  Clear
                </button>
                <button
                  className="ghost-button composer-send-button"
                  type="submit"
                  disabled={isSubmittingMessage}
                >
                  {isSubmittingMessage
                    ? editingMessageId !== null
                      ? "Saving..."
                      : "Sending..."
                    : editingMessageId !== null
                      ? "Save edit"
                      : "Send"}
                </button>
              </div>
            </form>
          </footer>
        </div>

        <aside className="room-context-rail">
          <article className="session-card">
            <p className="session-card-kicker">Room</p>
            <h2>Details</h2>
            <dl className="session-meta room-context-meta">
              <div>
                <dt>Visibility</dt>
                <dd>{selectedRoom.visibility}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{selectedRoom.can_manage_members ? "Admin" : "Member"}</dd>
              </div>
              <div>
                <dt>Members</dt>
                <dd>{selectedRoom.member_count}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{selectedRoom.is_owner ? "Owner" : "Joined"}</dd>
              </div>
            </dl>
            {canShowManageRoom ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setManageRoomTab("members");
                  setIsManageModalOpen(true);
                }}
              >
                Manage room
              </button>
            ) : null}
          </article>

          <article className="session-card room-people-card">
            <div className="room-context-card-header">
              <div>
                <p className="session-card-kicker">Members</p>
                <h2>Room members</h2>
              </div>
              <span className="sidebar-muted">{members.length}</span>
            </div>
            {isLoadingPeople ? (
              <p>Loading room members...</p>
            ) : (
              <ul className="room-people-list room-people-list--scrollable">
                {members.map((member) => (
                  <li key={member.id} className="room-people-item room-people-item--member">
                    <div className="room-person-summary">
                      <strong>{member.username}</strong>
                      <small className="presence-meta">
                        <span>
                          {member.is_owner ? "Owner" : member.is_admin ? "Admin" : "Member"}
                        </span>
                        <span className="presence-inline">
                          <span
                            className={`presence-dot presence-dot--${
                              getPresence(member.id) ?? member.presence_status ?? "offline"
                            }`}
                          />
                          {formatPresenceLabel(
                            getPresence(member.id) ?? member.presence_status ?? "offline",
                          )}
                        </span>
                      </small>
                    </div>
                    <div className="room-member-actions">
                      {getFriendshipState(member.id) === "friend" ? (
                        <span className="sidebar-muted">Friend</span>
                      ) : getFriendshipState(member.id) === "outgoing_request" ? (
                        <span className="sidebar-muted">Request sent</span>
                      ) : getFriendshipState(member.id) === "incoming_request" ? (
                        <span className="sidebar-muted">Sent you a request</span>
                      ) : getFriendshipState(member.id) === "none" ? (
                        <button
                          className="ghost-button sidebar-action-button"
                          type="button"
                          disabled={requestingFriendId === member.id}
                          onClick={() => {
                            void handleSendFriendRequest(member);
                          }}
                        >
                          {requestingFriendId === member.id ? "Sending..." : "Add friend"}
                        </button>
                      ) : null}
                      {!member.is_owner && member.id !== user?.id && !isUserBlocked(member.id) ? (
                        <button
                          className="ghost-button sidebar-action-button"
                          type="button"
                          disabled={blockingMemberId === member.id}
                          onClick={() => {
                            void handleBlockMember(member);
                          }}
                        >
                          {blockingMemberId === member.id ? "Blocking..." : "Block"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {selectedRoom.can_manage_members ? (
            <article className="session-card room-people-card">
              <div className="room-context-card-header">
                <div>
                  <p className="session-card-kicker">Moderation</p>
                  <h2>Banned users</h2>
                </div>
                <span className="sidebar-muted">{bans.length}</span>
              </div>
              {isLoadingPeople ? (
                <p>Loading moderation state...</p>
              ) : bans.length === 0 ? (
                <p>No banned users in this room right now.</p>
              ) : (
                <ul className="room-people-list room-people-list--scrollable">
                  {bans.map((ban) => (
                    <li key={ban.id} className="room-people-item">
                      <div>
                        <strong>{ban.username}</strong>
                        <small>{ban.reason ?? "Removed by a room admin."}</small>
                      </div>
                      <span className="sidebar-muted">
                        {ban.banned_by_username ? `By ${ban.banned_by_username}` : "Admin action"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { AppRouter } from "../../src/app/router";

const fetchMock = vi.fn<typeof fetch>();

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.(new Event("open"));
    });
  }

  send(_data: string) {}

  close() {
    this.onclose?.(new CloseEvent("close"));
  }

  emit(payload: unknown) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(payload),
      }),
    );
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

function renderRoutes(initialEntries: string[]) {
  return render(
    <AppProviders>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRouter />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("Message lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    MockWebSocket.reset();
    vi.unstubAllGlobals();
  });

  it("supports room message reply, edit, and delete flows", async () => {
    let messages = [
      {
        id: 1,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 1,
        body_text: "Initial room message",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
      },
    ];
    let sequenceHead = 1;

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              username: "Preview User",
              email: "preview@agentic.chat",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: "room-engineering",
                name: "engineering-room",
                description: "Coordination room for the main launch.",
                visibility: "public",
                owner_user_id: "user-1",
                member_count: 2,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/rooms/public")) {
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: "room-engineering",
                name: "engineering-room",
                description: "Coordination room for the main launch.",
                visibility: "public",
                owner_user_id: "user-1",
                member_count: 2,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-1",
                username: "Preview User",
                email: "preview@agentic.chat",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
              },
              {
                id: "user-2",
                username: "guest.user",
                email: "guest@example.com",
                joined_at: "2026-04-18T08:05:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/room-engineering/messages") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: sequenceHead,
            oldest_loaded_sequence: messages[0]?.sequence_number ?? null,
            newest_loaded_sequence: messages[messages.length - 1]?.sequence_number ?? null,
            next_before_sequence: null,
            has_older: false,
            messages,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as {
          body_text: string;
          reply_to_message_id?: number;
        };
        const replyTarget =
          typeof payload.reply_to_message_id === "number"
            ? messages.find((message) => message.id === payload.reply_to_message_id) ?? null
            : null;

        sequenceHead += 1;
        const createdMessage = {
          id: sequenceHead,
          conversation_id: "room-engineering",
          author_user_id: "user-1",
          author_username: "Preview User",
          sequence_number: sequenceHead,
          body_text: payload.body_text,
          reply_to_message_id: payload.reply_to_message_id ?? null,
          reply_to_message: replyTarget
            ? {
                id: replyTarget.id,
                author_username: replyTarget.author_username,
                body_text: replyTarget.body_text,
                deleted_at: replyTarget.deleted_at,
              }
            : null,
          created_at: "2026-04-18T09:05:00Z",
          edited_at: null,
          deleted_at: null,
          is_edited: false,
          is_deleted: false,
          can_edit: true,
          can_delete: true,
        };
        messages = [...messages, createdMessage];

        return new Response(JSON.stringify(createdMessage), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/messages/1") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body)) as { body_text: string };
        messages = messages.map((message) =>
          message.id === 1
            ? {
                ...message,
                body_text: payload.body_text,
                edited_at: "2026-04-18T09:06:00Z",
                is_edited: true,
              }
            : message,
        );

        return new Response(JSON.stringify(messages[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/messages/2") && init?.method === "DELETE") {
        messages = messages.map((message) =>
          message.id === 2
            ? {
                ...message,
                body_text: null,
                deleted_at: "2026-04-18T09:07:00Z",
                is_deleted: true,
                can_edit: false,
                can_delete: false,
              }
            : message,
        );

        return new Response(JSON.stringify(messages[1]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/dms/mine")) {
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Initial room message")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() => {
      expect(screen.getByText("Replying to Preview User")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Write a message"), {
      target: { value: "Reply from the room composer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Reply from the room composer")).toBeInTheDocument();
      expect(screen.getAllByText("Replying to").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Editing message #1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Write a message"), {
      target: { value: "Edited room message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await waitFor(() => {
      expect(screen.getByText("Edited room message")).toBeInTheDocument();
      expect(screen.getByText("Message updated.")).toBeInTheDocument();
      expect(screen.getByText("edited")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);

    await waitFor(() => {
      expect(screen.getByText("Message deleted.")).toBeInTheDocument();
    });
  });

  it("supports direct-message send flow on the shared conversation model", async () => {
    let directMessages = [
      {
        id: "dm-preview",
        counterpart_user_id: "user-2",
        counterpart_username: "existing.friend",
        status: "active",
        created_at: "2026-04-18T09:00:00Z",
        is_initiator: false,
        can_message: true,
      },
    ];
    let messages = [
      {
        id: 1,
        conversation_id: "dm-preview",
        author_user_id: "user-2",
        author_username: "existing.friend",
        sequence_number: 1,
        body_text: "Hello from your friend",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: false,
        can_delete: false,
      },
    ];
    let sequenceHead = 1;

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              username: "Preview User",
              email: "preview@agentic.chat",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/rooms/mine") || url.includes("/api/rooms/public")) {
        return new Response(JSON.stringify({ rooms: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/dms/mine")) {
        return new Response(JSON.stringify({ direct_messages: directMessages }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/dm-preview/messages") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-preview",
            sequence_head: sequenceHead,
            oldest_loaded_sequence: messages[0]?.sequence_number ?? null,
            newest_loaded_sequence: messages[messages.length - 1]?.sequence_number ?? null,
            next_before_sequence: null,
            has_older: false,
            messages,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/conversations/dm-preview/messages") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as { body_text: string };
        sequenceHead += 1;
        const createdMessage = {
          id: 2,
          conversation_id: "dm-preview",
          author_user_id: "user-1",
          author_username: "Preview User",
          sequence_number: sequenceHead,
          body_text: payload.body_text,
          reply_to_message_id: null,
          reply_to_message: null,
          created_at: "2026-04-18T09:02:00Z",
          edited_at: null,
          deleted_at: null,
          is_edited: false,
          is_deleted: false,
          can_edit: true,
          can_delete: true,
        };
        messages = [...messages, createdMessage];

        return new Response(JSON.stringify(createdMessage), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "existing.friend" })).toBeInTheDocument();
      expect(screen.getByText("Hello from your friend")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Write a direct message"), {
      target: { value: "Replying from the DM composer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Replying from the DM composer")).toBeInTheDocument();
      expect(screen.getByText("sequence 2")).toBeInTheDocument();
    });
  });

  it("loads older room history incrementally", async () => {
    const olderMessages = [
      {
        id: 1,
        conversation_id: "room-engineering",
        author_user_id: "user-2",
        author_username: "guest.user",
        sequence_number: 1,
        body_text: "Oldest message",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T08:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: false,
        can_delete: false,
      },
      {
        id: 2,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 2,
        body_text: "Older follow-up",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T08:10:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
      },
    ];
    const latestMessages = [
      {
        id: 3,
        conversation_id: "room-engineering",
        author_user_id: "user-2",
        author_username: "guest.user",
        sequence_number: 3,
        body_text: "Recent message one",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: false,
        can_delete: false,
      },
      {
        id: 4,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 4,
        body_text: "Recent message two",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:10:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
      },
    ];

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const parsedUrl = new URL(url);

      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              username: "Preview User",
              email: "preview@agentic.chat",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/rooms/mine") || url.includes("/api/rooms/public")) {
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: "room-engineering",
                name: "engineering-room",
                description: "Coordination room for the main launch.",
                visibility: "public",
                owner_user_id: "user-1",
                member_count: 2,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-1",
                username: "Preview User",
                email: "preview@agentic.chat",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        parsedUrl.pathname.endsWith("/api/conversations/room-engineering/messages") &&
        (!init?.method || init.method === "GET")
      ) {
        if (parsedUrl.searchParams.get("before_sequence") === "3") {
          return new Response(
            JSON.stringify({
              conversation_id: "room-engineering",
              sequence_head: 4,
              oldest_loaded_sequence: 1,
              newest_loaded_sequence: 2,
              next_before_sequence: null,
              has_older: false,
              messages: olderMessages,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 4,
            oldest_loaded_sequence: 3,
            newest_loaded_sequence: 4,
            next_before_sequence: 3,
            has_older: true,
            messages: latestMessages,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/dms/mine")) {
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Recent message one")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load older messages" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));

    await waitFor(() => {
      expect(screen.getByText("Oldest message")).toBeInTheDocument();
      expect(screen.getByText("Older follow-up")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Load older messages" }),
      ).not.toBeInTheDocument();
    });
  });

  it("applies live room message events from the websocket stream", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const initialMessages = [
      {
        id: 1,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 1,
        body_text: "Initial realtime message",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
      },
    ];

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              username: "Preview User",
              email: "preview@agentic.chat",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/api/rooms/mine") || url.includes("/api/rooms/public")) {
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: "room-engineering",
                name: "engineering-room",
                description: "Coordination room for the main launch.",
                visibility: "public",
                owner_user_id: "user-1",
                member_count: 2,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-1",
                username: "Preview User",
                email: "preview@agentic.chat",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        url.includes("/api/conversations/room-engineering/messages") &&
        (!init?.method || init.method === "GET")
      ) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 1,
            oldest_loaded_sequence: 1,
            newest_loaded_sequence: 1,
            next_before_sequence: null,
            has_older: false,
            messages: initialMessages,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/dms/mine")) {
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Initial realtime message")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("live updates")).toBeInTheDocument();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    await act(async () => {
      MockWebSocket.instances[0].emit({
        type: "message.created",
        conversation_id: "room-engineering",
        sequence_head: 2,
        message: {
          id: 2,
          conversation_id: "room-engineering",
          author_user_id: "user-2",
          author_username: "guest.user",
          sequence_number: 2,
          body_text: "Message delivered live",
          reply_to_message_id: null,
          reply_to_message: null,
          created_at: "2026-04-18T09:02:00Z",
          edited_at: null,
          deleted_at: null,
          is_edited: false,
          is_deleted: false,
          can_edit: false,
          can_delete: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Message delivered live")).toBeInTheDocument();
      expect(screen.getByText("sequence 2")).toBeInTheDocument();
    });
  });
});

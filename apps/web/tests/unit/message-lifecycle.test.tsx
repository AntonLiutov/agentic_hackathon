import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function findWebSocketByPath(path: string) {
  return MockWebSocket.instances.find((socket) => socket.url.includes(path));
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
    cleanup();
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
                friendship_state: "self",
              },
              {
                id: "user-2",
                username: "guest.user",
                email: "guest@example.com",
                joined_at: "2026-04-18T08:05:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: true,
                friendship_state: "none",
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /engineering-room/i })).toBeInTheDocument();
    }, { timeout: 5_000 });

    fireEvent.click(screen.getByRole("button", { name: /engineering-room/i }));

    await waitFor(() => {
      expect(screen.getByText("Initial room message")).toBeInTheDocument();
    }, { timeout: 5_000 });

    expect(screen.getByTitle("Your role: Owner")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Details" })).not.toBeInTheDocument();

    expect(screen.getByText("Initial room message").closest("article")).toHaveClass("message-card--own");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() => {
      expect(screen.getByText("Replying to Preview User")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.change(screen.getByPlaceholderText("Search emoji"), {
      target: { value: "rocket" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rocket" }));

    expect(screen.getByPlaceholderText("Write a message")).toHaveValue("🚀");

    fireEvent.change(screen.getByPlaceholderText("Write a message"), {
      target: { value: "Reply from the room composer 🚀" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Reply from the room composer 🚀")).toBeInTheDocument();
      expect(screen.getAllByText("Replying to").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(/Reply from the room composer/)[0].closest("article")).toHaveClass(
      "message-card--own",
    );

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
  }, 15_000);

  it("uploads and renders room attachments from the composer", async () => {
    let messages = [
      {
        id: 1,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 1,
        body_text: "Existing text message",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
        attachments: [],
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
        return new Response(
          JSON.stringify({
            rooms: [
              {
                id: "room-engineering",
                name: "engineering-room",
                description: "Coordination room for the main launch.",
                visibility: "public",
                owner_user_id: "user-1",
                member_count: 1,
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
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
                friendship_state: "self",
                presence_status: "online",
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

      if (
        url.endsWith("/api/conversations/room-engineering/messages/attachments") &&
        init?.method === "POST"
      ) {
        expect(init.body).toBeInstanceOf(FormData);
        const formData = init.body as FormData;
        expect(formData.get("attachment_comment")).toBe("UI mock attachment");
        const uploadedFile = formData.get("files");
        expect(uploadedFile).toBeInstanceOf(File);
        expect((uploadedFile as File).name).toBe("diagram.png");

        sequenceHead += 1;
        const createdMessage = {
          id: 2,
          conversation_id: "room-engineering",
          author_user_id: "user-1",
          author_username: "Preview User",
          sequence_number: sequenceHead,
          body_text: "Attachment launch note",
          reply_to_message_id: null,
          reply_to_message: null,
          created_at: "2026-04-18T09:10:00Z",
          edited_at: null,
          deleted_at: null,
          is_edited: false,
          is_deleted: false,
          can_edit: true,
          can_delete: true,
          attachments: [
            {
              id: "attachment-1",
              original_filename: "diagram.png",
              media_type: "image/png",
              size_bytes: 2048,
              comment_text: "UI mock attachment",
              content_path: "/api/attachments/attachment-1",
              download_path: "/api/attachments/attachment-1?download=1",
              is_image: true,
            },
          ],
        };
        messages = [...messages, createdMessage];

        return new Response(JSON.stringify(createdMessage), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/dms/mine")) {
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Existing text message")).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["diagram"], "diagram.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("diagram.png")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Optional attachment comment"), {
      target: { value: "UI mock attachment" },
    });
    fireEvent.change(screen.getByPlaceholderText("Write a message"), {
      target: { value: "Attachment launch note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Attachment launch note")).toBeInTheDocument();
      expect(screen.getAllByText("diagram.png").length).toBeGreaterThan(0);
      expect(screen.getByText("UI mock attachment")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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
    });
  });

  it("uploads and renders direct-message attachments from the composer", async () => {
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
        attachments: [],
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

      if (url.endsWith("/api/friends")) {
        return new Response(
          JSON.stringify({
            friends: [
              {
                user_id: "user-2",
                username: "existing.friend",
                presence_status: "online",
                created_at: "2026-04-18T08:50:00Z",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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

      if (
        url.endsWith("/api/conversations/dm-preview/messages/attachments") &&
        init?.method === "POST"
      ) {
        expect(init.body).toBeInstanceOf(FormData);
        const formData = init.body as FormData;
        expect(formData.get("attachment_comment")).toBe("Private handoff");
        const uploadedFile = formData.get("files");
        expect(uploadedFile).toBeInstanceOf(File);
        expect((uploadedFile as File).name).toBe("handoff.pdf");

        sequenceHead += 1;
        const createdMessage = {
          id: 2,
          conversation_id: "dm-preview",
          author_user_id: "user-1",
          author_username: "Preview User",
          sequence_number: sequenceHead,
          body_text: "DM attachment note",
          reply_to_message_id: null,
          reply_to_message: null,
          created_at: "2026-04-18T09:02:00Z",
          edited_at: null,
          deleted_at: null,
          is_edited: false,
          is_deleted: false,
          can_edit: true,
          can_delete: true,
          attachments: [
            {
              id: "attachment-dm-1",
              original_filename: "handoff.pdf",
              media_type: "application/pdf",
              size_bytes: 2048,
              comment_text: "Private handoff",
              content_path: "/api/attachments/attachment-dm-1",
              download_path: "/api/attachments/attachment-dm-1?download=1",
              is_image: false,
            },
          ],
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

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["handoff"], "handoff.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("handoff.pdf")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Optional attachment comment"), {
      target: { value: "Private handoff" },
    });
    fireEvent.change(screen.getByPlaceholderText("Write a direct message"), {
      target: { value: "DM attachment note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("DM attachment note")).toBeInTheDocument();
      expect(screen.getAllByText("handoff.pdf").length).toBeGreaterThan(0);
      expect(screen.getByText("Private handoff")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
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
                friendship_state: "self",
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Recent message one")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Older messages" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Older messages" }));

    await waitFor(() => {
      expect(screen.getByText("Oldest message")).toBeInTheDocument();
      expect(screen.getByText("Older follow-up")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Older messages" }),
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
                friendship_state: "self",
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

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 1,
            unread_count: 0,
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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
      expect(screen.getByText("Live")).toBeInTheDocument();
      expect(findWebSocketByPath("/ws/conversations/room-engineering")).toBeTruthy();
    });

    await act(async () => {
      findWebSocketByPath("/ws/conversations/room-engineering")?.emit({
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
    });

    const liveMessageCard = screen.getByText("Message delivered live").closest("article");
    expect(liveMessageCard).not.toBeNull();
    if (liveMessageCard) {
      expect(within(liveMessageCard).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(within(liveMessageCard).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    }
  }, 15_000);

  it("refreshes an open direct message when the counterpart account becomes deleted", async () => {
    let counterpartUsername = "Roman";
    let directMessageStatus = "active";
    let messages = [
      {
        id: 1,
        conversation_id: "dm-roman",
        author_user_id: "user-2",
        author_username: counterpartUsername,
        sequence_number: 1,
        body_text: "hey",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:00:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: false,
        can_delete: false,
        attachments: [],
      },
      {
        id: 2,
        conversation_id: "dm-roman",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 2,
        body_text: "My latest reply",
        reply_to_message_id: null,
        reply_to_message: null,
        created_at: "2026-04-18T09:01:00Z",
        edited_at: null,
        deleted_at: null,
        is_edited: false,
        is_deleted: false,
        can_edit: true,
        can_delete: true,
        attachments: [],
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

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/rooms/public")) {
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
        return new Response(
          JSON.stringify({
            direct_messages: [
              {
                id: "dm-roman",
                counterpart_user_id: "user-2",
                counterpart_username: counterpartUsername,
                counterpart_presence_status: "offline",
                status: directMessageStatus,
                unread_count: 0,
                can_message: directMessageStatus === "active",
                is_initiator: true,
                created_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/friends")) {
        return new Response(
          JSON.stringify({
            friends: [
              {
                user_id: "user-2",
                username: counterpartUsername,
                email: "roman@example.com",
                friendship_id: "friend-1",
                presence_status: "offline",
                created_at: "2026-04-18T08:00:00Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/blocks")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        url.includes("/api/conversations/dm-roman/messages") &&
        (!init?.method || init.method === "GET")
      ) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-roman",
            sequence_head: messages.length,
            oldest_loaded_sequence: messages[0]?.sequence_number ?? null,
            newest_loaded_sequence: messages[messages.length - 1]?.sequence_number ?? null,
            next_before_sequence: null,
            has_older: false,
            messages,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/conversations/dm-roman/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-roman",
            last_read_sequence_number: messages.length,
            unread_count: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Roman" })).toBeInTheDocument();
      expect(screen.getByText("hey")).toBeInTheDocument();
    });

    expect(screen.getByText("My latest reply").closest("article")).toHaveClass("message-card--own");

    counterpartUsername = "Deleted user";
    directMessageStatus = "inactive";
    messages = messages.map((message) => ({
      ...message,
      author_username: "Deleted user",
    }));

    const inboxSocket = findWebSocketByPath("/ws/inbox");
    expect(inboxSocket).toBeDefined();

    act(() => {
      inboxSocket?.emit({ type: "friendships.updated" });
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Deleted user" })).toBeInTheDocument();
      expect(screen.getAllByText("Deleted user").length).toBeGreaterThan(1);
    });
  }, 15_000);

  it("keeps the room thread inside a dedicated scrollable conversation pane", async () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      conversation_id: "room-engineering",
      author_user_id: index % 2 === 0 ? "user-1" : "user-2",
      author_username: index % 2 === 0 ? "Preview User" : "guest.user",
      sequence_number: index + 1,
      body_text: `Room message ${index + 1}`,
      reply_to_message_id: null,
      reply_to_message: null,
      created_at: "2026-04-18T09:00:00Z",
      edited_at: null,
      deleted_at: null,
      is_edited: false,
      is_deleted: false,
      can_edit: index % 2 === 0,
      can_delete: index % 2 === 0,
      attachments: [],
    }));

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
                friendship_state: "self",
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
            sequence_head: messages.length,
            oldest_loaded_sequence: messages[0]?.sequence_number ?? null,
            newest_loaded_sequence: messages[messages.length - 1]?.sequence_number ?? null,
            next_before_sequence: null,
            has_older: false,
            messages,
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const { container } = renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Room message 8")).toBeInTheDocument();
    });

    const workspace = container.querySelector(".chat-workspace--conversation");
    const layout = container.querySelector(".chat-room-layout");
    const thread = container.querySelector(".chat-room-main--thread");
    const scrollRegion = container.querySelector(".message-list--scrollable");

    expect(workspace).not.toBeNull();
    expect(layout).not.toBeNull();
    expect(thread).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
  }, 15_000);

  it("reloads the active room after websocket reconnect subscription", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let currentMessages = [
      {
        id: 1,
        conversation_id: "room-engineering",
        author_user_id: "user-1",
        author_username: "Preview User",
        sequence_number: 1,
        body_text: "Reconnect baseline message",
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
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
                friendship_state: "self",
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

      if (url.endsWith("/api/rooms/room-engineering/invitations")) {
        return new Response(JSON.stringify({ invitations: [] }), {
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
            sequence_head: sequenceHead,
            oldest_loaded_sequence: currentMessages[0]?.sequence_number ?? null,
            newest_loaded_sequence:
              currentMessages[currentMessages.length - 1]?.sequence_number ?? null,
            next_before_sequence: null,
            has_older: false,
            messages: currentMessages,
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

      if (url.endsWith("/api/friends")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests")) {
        return new Response(
          JSON.stringify({
            incoming_requests: [],
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByText("Reconnect baseline message")).toBeInTheDocument();
      expect(findWebSocketByPath("/ws/conversations/room-engineering")).toBeTruthy();
    });

    currentMessages = [
      ...currentMessages,
      {
        id: 2,
        conversation_id: "room-engineering",
        author_user_id: "user-2",
        author_username: "guest.user",
        sequence_number: 2,
        body_text: "Recovered after reconnect",
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
    ];
    sequenceHead = 2;

    await act(async () => {
      findWebSocketByPath("/ws/conversations/room-engineering")?.close();
    });

    await waitFor(() => {
      expect(
        MockWebSocket.instances.filter((socket) =>
          socket.url.includes("/ws/conversations/room-engineering"),
        ).length,
      ).toBeGreaterThan(1);
    });

    const latestSocket = MockWebSocket.instances.at(-1);

    await act(async () => {
      latestSocket?.emit({
        type: "conversation.subscribed",
        conversation_id: "room-engineering",
        sequence_head: 2,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Recovered after reconnect")).toBeInTheDocument();
    });
  }, 15_000);
});

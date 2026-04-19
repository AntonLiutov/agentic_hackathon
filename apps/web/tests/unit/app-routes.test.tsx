import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/api/auth/me")) {
      return new Response(JSON.stringify({ detail: "Authentication required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/api/auth/login") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          user: {
            id: "user-1",
            username: "Preview User",
            email: "preview@agentic.chat",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
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
              member_count: 4,
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
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
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
              member_count: 4,
              is_member: true,
              is_owner: true,
              is_admin: true,
              is_banned: false,
              can_join: false,
              can_leave: false,
              can_manage_members: true,
              joined_at: "2026-04-18T08:00:00Z",
            },
            {
              id: "room-random",
              name: "random",
              description: "General room for the wider workspace.",
              visibility: "public",
              owner_user_id: "user-2",
              member_count: 7,
              is_member: false,
              is_owner: false,
              is_admin: false,
              is_banned: false,
              can_join: true,
              can_leave: false,
              can_manage_members: false,
              joined_at: null,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.endsWith("/api/rooms/invitations/mine")) {
      return new Response(JSON.stringify({ invitations: [] }), {
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

    if (url.endsWith("/api/blocks")) {
      return new Response(JSON.stringify({ blocked_users: [] }), {
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
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.endsWith("/api/rooms/room-engineering/bans")) {
      return new Response(JSON.stringify({ bans: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchMock.mockReset();
  MockWebSocket.reset();
  vi.unstubAllGlobals();
});

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

describe("App routes", () => {
  it("renders the landing page", () => {
    renderRoutes(["/"]);

    expect(
      screen.getByText("Frontend foundation for a production-ready classic chat app"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("redirects anonymous users from protected routes to sign in", async () => {
    renderRoutes(["/app/chats"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });
  });

  it("enters the protected workspace through sign-in", async () => {
    renderRoutes(["/signin"]);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "preview@agentic.chat" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "#engineering-room" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("preview@agentic.chat")).toBeInTheDocument();
  });

  it("restores the last selected room after a reload", async () => {
    window.localStorage.setItem("agentic_selected_room_id", "room-random");

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
                member_count: 4,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
              },
              {
                id: "room-random",
                name: "random",
                description: "General room for the wider workspace.",
                visibility: "public",
                owner_user_id: "user-2",
                member_count: 7,
                is_member: true,
                is_owner: false,
                is_admin: false,
                is_banned: false,
                can_join: false,
                can_leave: true,
                can_manage_members: false,
                joined_at: "2026-04-18T09:00:00Z",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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

      if (url.endsWith("/api/blocks")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-random/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-2",
                username: "room.owner",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
                presence_status: "offline",
                friendship_state: "none",
              },
              {
                id: "user-1",
                username: "Preview User",
                joined_at: "2026-04-18T09:00:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: false,
                presence_status: "online",
                friendship_state: "self",
              },
            ],
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
      expect(screen.getByRole("heading", { level: 1, name: "#random" })).toBeInTheDocument();
    });
  });

  it("joins a public room from the sidebar", async () => {
    let myRooms = [
      {
        id: "room-engineering",
        name: "engineering-room",
        description: "Coordination room for the main launch.",
        visibility: "public",
        owner_user_id: "user-1",
        member_count: 4,
        is_member: true,
        is_owner: true,
        is_admin: true,
        is_banned: false,
        can_join: false,
        can_leave: false,
        can_manage_members: true,
        joined_at: "2026-04-18T08:00:00Z",
      },
    ];
    let publicRooms = [
      ...myRooms,
      {
        id: "room-random",
        name: "random",
        description: "General room for the wider workspace.",
        visibility: "public",
        owner_user_id: "user-2",
        member_count: 7,
        is_member: false,
        is_owner: false,
        is_admin: false,
        is_banned: false,
        can_join: true,
        can_leave: false,
        can_manage_members: false,
        joined_at: null,
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: myRooms }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/rooms/public")) {
        return new Response(JSON.stringify({ rooms: publicRooms }), {
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-random/join") && init?.method === "POST") {
        const joinedRoom = {
          id: "room-random",
          name: "random",
          description: "General room for the wider workspace.",
          visibility: "public",
          owner_user_id: "user-2",
          member_count: 8,
          is_member: true,
          is_owner: false,
          is_admin: false,
          is_banned: false,
          can_join: false,
          can_leave: true,
          can_manage_members: false,
          joined_at: "2026-04-18T09:00:00Z",
        };
        myRooms = [...myRooms, joinedRoom];
        publicRooms = publicRooms.map((room) => (room.id === "room-random" ? joinedRoom : room));

        return new Response(JSON.stringify(joinedRoom), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-random/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-2",
                username: "room.owner",
                email: "owner@example.com",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
              },
              {
                id: "user-1",
                username: "Preview User",
                email: "preview@agentic.chat",
                joined_at: "2026-04-18T09:00:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: false,
              },
            ],
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
      expect(
        screen.getByRole("heading", { level: 1, name: "#engineering-room" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(screen.getByText("You joined #random.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "#random" })).toBeInTheDocument();
    });
  });

  it("accepts a private-room invitation from the sidebar", async () => {
    let invitations = [
      {
        id: "invite-1",
        room_conversation_id: "room-private",
        room_name: "war-room",
        room_description: "Private launch planning room.",
        inviter_username: "owner.user",
        status: "pending",
        created_at: "2026-04-18T08:00:00Z",
      },
    ];
    let myRooms: unknown[] = [];
    let publicRooms: unknown[] = [];

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: myRooms }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/rooms/public")) {
        return new Response(JSON.stringify({ rooms: publicRooms }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/invitations/invite-1/accept") && init?.method === "POST") {
        invitations = [];
        const privateRoom = {
          id: "room-private",
          name: "war-room",
          description: "Private launch planning room.",
          visibility: "private",
          owner_user_id: "user-2",
          member_count: 2,
          is_member: true,
          is_owner: false,
          is_admin: false,
          is_banned: false,
          can_join: false,
          can_leave: true,
          can_manage_members: false,
          joined_at: "2026-04-18T09:10:00Z",
        };
        myRooms = [privateRoom];

        return new Response(JSON.stringify(privateRoom), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-private/members")) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "user-2",
                username: "owner.user",
                email: "owner@example.com",
                joined_at: "2026-04-18T08:00:00Z",
                is_owner: true,
                is_admin: true,
                can_remove: false,
              },
              {
                id: "user-1",
                username: "Preview User",
                email: "preview@agentic.chat",
                joined_at: "2026-04-18T09:10:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: false,
              },
            ],
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
      expect(screen.getByRole("button", { name: /#war-room/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.getByText("Invitation accepted. You joined #war-room.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "#war-room" })).toBeInTheDocument();
    });
  });

  it("refreshes room members live when a room update event arrives", async () => {
    let myRooms = [
      {
        id: "room-engineering",
        name: "engineering-room",
        description: "Coordination room for the main launch.",
        visibility: "public",
        owner_user_id: "user-1",
        member_count: 4,
        is_member: true,
        is_owner: true,
        is_admin: true,
        is_banned: false,
        can_join: false,
        can_leave: false,
        can_manage_members: true,
        joined_at: "2026-04-18T08:00:00Z",
      },
    ];
    let publicRooms = [...myRooms];
    let members = [
      {
        id: "user-1",
        username: "Preview User",
        joined_at: "2026-04-18T08:00:00Z",
        is_owner: true,
        is_admin: true,
        can_remove: false,
        presence_status: "online",
        friendship_state: "self",
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: myRooms }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/rooms/public")) {
        return new Response(JSON.stringify({ rooms: publicRooms }), {
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

      if (url.endsWith("/api/blocks")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members")) {
        return new Response(
          JSON.stringify({
            members,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/room-engineering/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 0,
            unread_count: 0,
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
      expect(screen.getByText("Preview User")).toBeInTheDocument();
    });

    myRooms = [
      {
        ...myRooms[0],
        member_count: 5,
      },
    ];
    publicRooms = [...myRooms];
    members = [
      ...members,
      {
        id: "user-2",
        username: "new.live.member",
        joined_at: "2026-04-18T09:00:00Z",
        is_owner: false,
        is_admin: false,
        can_remove: true,
        presence_status: "online",
        friendship_state: "none",
      },
    ];

    await act(async () => {
      MockWebSocket.instances.find((socket) => socket.url.endsWith("/ws/inbox"))?.emit({
        type: "rooms.updated",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("new.live.member")).toBeInTheDocument();
      expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    });
  });

  it("updates the owner room view live when an invitation is accepted", async () => {
    let myRooms = [
      {
        id: "room-engineering",
        name: "engineering-room",
        description: "Coordination room for the main launch.",
        visibility: "private",
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
    ];
    let members = [
      {
        id: "user-1",
        username: "Preview User",
        joined_at: "2026-04-18T08:00:00Z",
        is_owner: true,
        is_admin: true,
        can_remove: false,
        presence_status: "online",
        friendship_state: "self",
      },
    ];
    let invitations = [
      {
        id: "invite-1",
        invitee_user_id: "user-2",
        invitee_username: "accepted.user",
        inviter_username: "Preview User",
        status: "pending",
        created_at: "2026-04-19T19:00:00Z",
        message: "Please join the room.",
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: myRooms }), {
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

      if (url.endsWith("/api/blocks")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members")) {
        return new Response(JSON.stringify({ members }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/invitations")) {
        return new Response(JSON.stringify({ invitations }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/room-engineering/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 0,
            unread_count: 0,
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
      expect(screen.getByText("Preview User")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage room" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Invitations" }));

    await waitFor(() => {
      expect(screen.getByText("accepted.user")).toBeInTheDocument();
    });

    myRooms = [
      {
        ...myRooms[0],
        member_count: 2,
      },
    ];
    members = [
      ...members,
      {
        id: "user-2",
        username: "accepted.user",
        joined_at: "2026-04-19T19:05:00Z",
        is_owner: false,
        is_admin: false,
        can_remove: true,
        presence_status: "offline",
        friendship_state: "none",
      },
    ];
    invitations = [];

    await act(async () => {
      MockWebSocket.instances.find((socket) => socket.url.endsWith("/ws/inbox"))?.emit({
        type: "rooms.updated",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Please join the room.")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Members" }));

    await waitFor(() => {
      expect(screen.getAllByText("accepted.user").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });
  });

  it("opens the manage room modal and unbans a user", async () => {
    let bans = [
      {
        id: "ban-1",
        user_id: "user-8",
        username: "mike",
        banned_at: "2026-04-19T08:00:00Z",
        banned_by_username: "Preview User",
        reason: "Removed by a room admin.",
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
                visibility: "private",
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
                unread_count: 0,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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
          JSON.stringify({ incoming_requests: [], outgoing_requests: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/blocks")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
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
              {
                id: "user-2",
                username: "room.member",
                joined_at: "2026-04-18T08:10:00Z",
                is_owner: false,
                is_admin: false,
                can_remove: true,
                friendship_state: "none",
                presence_status: "offline",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans }), {
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

      if (url.includes("/api/conversations/room-engineering/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 0,
            unread_count: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans/user-8") && init?.method === "DELETE") {
        bans = [];
        return new Response(
          JSON.stringify({
            success: true,
            message: "User removed from the room ban list.",
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
      expect(
        screen.getByRole("heading", { level: 1, name: "#engineering-room" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage room" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Banned users" }));
    fireEvent.click(screen.getByRole("button", { name: "Unban" }));

    await waitFor(() => {
      expect(screen.getByText("User removed from the room ban list.")).toBeInTheDocument();
    });
  });

  it("navigates to the chat workspace when a room is clicked from contacts", async () => {
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
                member_count: 4,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
                unread_count: 2,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
                member_count: 4,
                is_member: true,
                is_owner: true,
                is_admin: true,
                is_banned: false,
                can_join: false,
                can_leave: false,
                can_manage_members: true,
                joined_at: "2026-04-18T08:00:00Z",
                unread_count: 2,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/invitations/mine")) {
        return new Response(JSON.stringify({ invitations: [] }), {
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
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
            sequence_head: 2,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 2,
            unread_count: 0,
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

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /#engineering-room/i }).length,
      ).toBeGreaterThan(0);
    });

    const [roomButton] = screen.getAllByRole("button", { name: /#engineering-room/i });
    expect(roomButton).toHaveTextContent("2");

    fireEvent.click(roomButton);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "#engineering-room" }),
      ).toBeInTheDocument();
    });
  }, 15_000);

  it("removes a member and shows the room ban state to admins", async () => {
    let members = [
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
        joined_at: "2026-04-18T08:03:00Z",
        is_owner: false,
        is_admin: false,
        can_remove: true,
      },
    ];
    let bans: Array<{
      id: string;
      user_id: string;
      username: string;
      email: string;
      banned_at: string;
      banned_by_username: string | null;
      reason: string | null;
    }> = [];
    let myRooms = [
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
    ];
    let publicRooms = [...myRooms];

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.includes("/api/rooms/mine")) {
        return new Response(JSON.stringify({ rooms: myRooms }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/rooms/public")) {
        return new Response(JSON.stringify({ rooms: publicRooms }), {
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

      if (url.endsWith("/api/rooms/room-engineering/invitations")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/members") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ members }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(JSON.stringify({ bans }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/room-engineering/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/room-engineering/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            last_read_sequence_number: 0,
            unread_count: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/members/user-2") && init?.method === "DELETE") {
        members = members.filter((member) => member.id !== "user-2");
        bans = [
          {
            id: "ban-1",
            user_id: "user-2",
            username: "guest.user",
            email: "guest@example.com",
            banned_at: "2026-04-18T09:00:00Z",
            banned_by_username: "Preview User",
            reason: "Removed by a room admin.",
          },
        ];
        myRooms = [
          {
            ...myRooms[0],
            member_count: 1,
          },
        ];
        publicRooms = myRooms;

        return new Response(
          JSON.stringify({
            success: true,
            message: "Member removed from the room and banned from rejoining.",
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
      expect(screen.getByText("guest.user")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage room" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove from room" }));

    await waitFor(() => {
      expect(
        screen.getByText("Member removed from the room and banned from rejoining."),
      ).toBeInTheDocument();
      expect(screen.getByText("By Preview User")).toBeInTheDocument();
      expect(screen.getByText("Removed by a room admin.")).toBeInTheDocument();
    });
  });

  it("opens a direct message from the friend list on the contacts page", async () => {
    let directMessages = [
      {
        id: "dm-preview",
        counterpart_user_id: "user-2",
        counterpart_username: "existing.friend",
        status: "active",
        created_at: "2026-04-18T09:00:00Z",
        is_initiator: false,
        can_message: true,
        unread_count: 0,
      },
    ];
    let friends = [
      {
        friendship_id: "friendship-1",
        user_id: "user-3",
        username: "new.friend",
        friends_since: "2026-04-18T08:30:00Z",
        presence_status: "online",
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        return new Response(JSON.stringify({ direct_messages: directMessages }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
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

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/conversations/dm-preview/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-preview",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/dm-preview/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-preview",
            last_read_sequence_number: 0,
            unread_count: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/dms") && init?.method === "POST") {
        const openedDirectMessage = {
          id: "dm-new",
          counterpart_user_id: "user-3",
          counterpart_username: "new.friend",
          status: "active",
          created_at: "2026-04-18T10:00:00Z",
          is_initiator: true,
          can_message: true,
          unread_count: 0,
        };
        directMessages = [...directMessages, openedDirectMessage];

        return new Response(JSON.stringify(openedDirectMessage), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/conversations/dm-new/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-new",
            sequence_head: 0,
            oldest_loaded_sequence: null,
            newest_loaded_sequence: null,
            next_before_sequence: null,
            has_older: false,
            messages: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/dm-new/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-new",
            last_read_sequence_number: 0,
            unread_count: 0,
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

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "Direct messages" }).length).toBeGreaterThan(0);
      expect(screen.getByText("new.friend")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /existing\.friend/i })).toBeInTheDocument();
    });

    const newFriendListItem = screen.getByText("new.friend").closest(".contacts-list-item");
    expect(newFriendListItem).not.toBeNull();

    if (newFriendListItem) {
      fireEvent.click(within(newFriendListItem).getByRole("button", { name: "Open DM" }));
    }

    await waitFor(() => {
      expect(screen.getByText("Direct message ready with new.friend.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "new.friend" })).toBeInTheDocument();
      expect(screen.getByText("Direct conversation on the shared chat model.")).toBeInTheDocument();
    });
  });

  it("sends, accepts, and removes friendships from the contacts flow", async () => {
    let friends = [
      {
        friendship_id: "friendship-1",
        user_id: "user-2",
        username: "existing.friend",
        friends_since: "2026-04-18T08:00:00Z",
        presence_status: "online",
      },
    ];
    let incomingRequests = [
      {
        id: "request-1",
        requester_user_id: "user-3",
        requester_username: "pending.friend",
        recipient_user_id: "user-1",
        recipient_username: "Preview User",
        request_text: "Want to collaborate?",
        status: "pending",
        created_at: "2026-04-18T09:00:00Z",
      },
    ];
    let outgoingRequests = [];

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            incoming_requests: incomingRequests,
            outgoing_requests: outgoingRequests,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && init?.method === "POST") {
        outgoingRequests = [
          {
            id: "request-2",
            requester_user_id: "user-1",
            requester_username: "Preview User",
            recipient_user_id: "user-4",
            recipient_username: "new.friend",
            request_text: "Let's connect!",
            status: "pending",
            created_at: "2026-04-18T09:10:00Z",
          },
          ...outgoingRequests,
        ];

        return new Response(JSON.stringify(outgoingRequests[0]), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests/request-1/accept") && init?.method === "POST") {
        incomingRequests = [];
        friends = [
          {
            friendship_id: "friendship-2",
            user_id: "user-3",
            username: "pending.friend",
            friends_since: "2026-04-18T09:15:00Z",
            presence_status: "offline",
          },
          ...friends,
        ];

        return new Response(JSON.stringify(friends[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/user-2") && init?.method === "DELETE") {
        friends = friends.filter((friend) => friend.user_id !== "user-2");

        return new Response(
          JSON.stringify({
            success: true,
            message: "Friend removed.",
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

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(screen.getByText("existing.friend")).toBeInTheDocument();
      expect(screen.getByText("pending.friend")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new.friend" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Let's connect!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send friend request" }));

    await waitFor(() => {
      expect(screen.getByText("Friend request sent to new.friend.")).toBeInTheDocument();
      expect(screen.getByText("new.friend")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.getByText("You are now friends with pending.friend.")).toBeInTheDocument();
      expect(screen.queryByText("Want to collaborate?")).not.toBeInTheDocument();
    });

    const existingFriendListItem = screen
      .getByText("existing.friend")
      .closest(".contacts-list-item");
    expect(existingFriendListItem).not.toBeNull();

    if (existingFriendListItem) {
      fireEvent.click(within(existingFriendListItem).getByRole("button", { name: "Remove" }));
    }

    await waitFor(() => {
      expect(screen.getByText("existing.friend removed from your friends list.")).toBeInTheDocument();
      expect(screen.queryAllByText("existing.friend")).toHaveLength(0);
    });
  });

  it("refreshes friendship state live after an inbox friendship event", async () => {
    let friends = [] as Array<{
      friendship_id: string;
      user_id: string;
      username: string;
      friends_since: string;
      presence_status: "online" | "afk" | "offline";
    }>;
    let incomingRequests = [] as Array<{
      id: string;
      requester_user_id: string;
      requester_username: string;
      recipient_user_id: string;
      recipient_username: string;
      request_text: string | null;
      status: "pending";
      created_at: string;
    }>;
    let outgoingRequests = [] as Array<{
      id: string;
      requester_user_id: string;
      requester_username: string;
      recipient_user_id: string;
      recipient_username: string;
      request_text: string | null;
      status: "pending";
      created_at: string;
    }>;

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/login") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "preview@agentic.chat",
              username: "Preview User",
              name: "Preview User",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/rooms/mine") || url.endsWith("/api/rooms/public")) {
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
        return new Response(JSON.stringify({ direct_messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            incoming_requests: incomingRequests,
            outgoing_requests: outgoingRequests,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/signin"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "preview@agentic.chat" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Contacts/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: /Contacts/i }));

    await waitFor(() => {
      expect(screen.getByText("No incoming requests.")).toBeInTheDocument();
    });

    incomingRequests = [
      {
        id: "request-live-1",
        requester_user_id: "user-7",
        requester_username: "live.friend",
        recipient_user_id: "user-1",
        recipient_username: "Preview User",
        request_text: "Realtime hello",
        status: "pending",
        created_at: "2026-04-19T18:00:00Z",
      },
    ];

    await act(async () => {
      MockWebSocket.instances[0]?.emit({ type: "friendships.updated" });
    });

    await waitFor(() => {
      expect(screen.getByText("live.friend")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    });
  });

  it("refreshes the direct-message list after accepting a friendship request", async () => {
    let incomingRequests = [
      {
        id: "request-accept-1",
        requester_user_id: "user-7",
        requester_username: "live.friend",
        recipient_user_id: "user-1",
        recipient_username: "Preview User",
        request_text: "Let's chat",
        status: "pending",
        created_at: "2026-04-19T18:00:00Z",
      },
    ];
    let directMessages = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/login") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              username: "Preview User",
              email: "preview@agentic.chat",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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
        return new Response(JSON.stringify({ direct_messages: directMessages }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            friends: directMessages.length
              ? [
                  {
                    friendship_id: "friendship-1",
                    user_id: "user-7",
                    username: "live.friend",
                    presence_status: "online",
                    created_at: "2026-04-19T18:01:00Z",
                  },
                ]
              : [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            incoming_requests: incomingRequests,
            outgoing_requests: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (
        url.endsWith("/api/friends/requests/request-accept-1/accept") &&
        init?.method === "POST"
      ) {
        incomingRequests = [];
        directMessages = [
          {
            id: "dm-1",
            counterpart_user_id: "user-7",
            counterpart_username: "live.friend",
            counterpart_presence_status: "online",
            status: "active",
            created_at: "2026-04-19T18:01:00Z",
            is_initiator: false,
            can_message: true,
            unread_count: 0,
          },
        ];

        return new Response(
          JSON.stringify({
            friendship_id: "friendship-1",
            user_id: "user-7",
            username: "live.friend",
            presence_status: "online",
            created_at: "2026-04-19T18:01:00Z",
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

    renderRoutes(["/signin"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "preview@agentic.chat" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Contacts/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: /Contacts/i }));

    await waitFor(() => {
      expect(
        screen.getByText("No direct messages yet. Open your first one from the friend list."),
      ).toBeInTheDocument();
      expect(screen.getByText("live.friend")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "live.friend online" })).toBeInTheDocument();
      expect(screen.getByText("You are now friends with live.friend.")).toBeInTheDocument();
    });
  });

  it("refreshes the direct-message list when the first unread event arrives for an unknown dm", async () => {
    let directMessages: Array<{
      id: string;
      counterpart_user_id: string;
      counterpart_username: string;
      counterpart_presence_status: "online" | "afk" | "offline";
      status: "active" | "frozen";
      created_at: string;
      is_initiator: boolean;
      can_message: boolean;
      unread_count: number;
    }> = [];

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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

      if (url.endsWith("/api/dms/dm-first-live-1")) {
        return new Response(JSON.stringify(directMessages[0] ?? null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/dm-first-live-1/messages")) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-first-live-1",
            sequence_head: 1,
            oldest_loaded_sequence: 1,
            newest_loaded_sequence: 1,
            next_before_sequence: null,
            has_older: false,
            messages: [
              {
                id: 101,
                conversation_id: "dm-first-live-1",
                author_user_id: "user-12",
                author_username: "first.live",
                sequence_number: 1,
                body_text: "Hello from the very first live DM.",
                reply_to_message_id: null,
                reply_to_message: null,
                created_at: "2026-04-19T19:10:00Z",
                edited_at: null,
                deleted_at: null,
                is_edited: false,
                is_deleted: false,
                can_edit: false,
                can_delete: false,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (
        url.endsWith("/api/conversations/dm-first-live-1/read") &&
        init?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            conversation_id: "dm-first-live-1",
            last_read_sequence_number: 1,
            unread_count: 0,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
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

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: [] }), {
          status: 200,
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
      expect(
        screen.getByText("No direct messages yet. Open your first one from the friend list."),
      ).toBeInTheDocument();
    });

    directMessages = [
      {
        id: "dm-first-live-1",
        counterpart_user_id: "user-12",
        counterpart_username: "first.live",
        counterpart_presence_status: "online",
        status: "active",
        created_at: "2026-04-19T19:10:00Z",
        is_initiator: false,
        can_message: true,
        unread_count: 1,
      },
    ];

    await act(async () => {
      MockWebSocket.instances[0]?.emit({
        type: "conversation.unread",
        conversation_id: "dm-first-live-1",
        sequence_head: 1,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "first.live online" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from the very first live DM.")).toBeInTheDocument();
    });
  });

  it("shows a frozen direct message as read-only after a block", async () => {
    const directMessages = [
      {
        id: "dm-frozen-1",
        counterpart_user_id: "user-8",
        counterpart_username: "blocked.friend",
        counterpart_presence_status: "offline",
        status: "frozen",
        created_at: "2026-04-19T19:00:00Z",
        is_initiator: true,
        can_message: false,
        unread_count: 0,
      },
    ];
    const blockedUsers = [
      {
        block_id: "block-1",
        blocked_user_id: "user-8",
        blocked_username: "blocked.friend",
        reason: "Not a fit",
        blocked_at: "2026-04-19T19:05:00Z",
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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

      if (url.endsWith("/api/dms/dm-frozen-1")) {
        return new Response(JSON.stringify(directMessages[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
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

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: blockedUsers }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/dm-frozen-1/messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: 101,
                conversation_id: "dm-frozen-1",
                author_user_id: "user-8",
                author_username: "blocked.friend",
                body_text: "Last message before block.",
                sequence_number: 3,
                created_at: "2026-04-19T19:01:00Z",
                updated_at: null,
                deleted_at: null,
                is_deleted: false,
                can_edit: false,
                can_delete: false,
                reply_to_message_id: null,
                reply_preview: null,
              },
            ],
            sequence_head: 3,
            oldest_loaded_sequence: 3,
            newest_loaded_sequence: 3,
            next_before_sequence: null,
            has_older: false,
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

    renderRoutes(["/app/contacts"]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "blocked.friend offline" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "blocked.friend offline" }));

    await waitFor(() => {
      expect(screen.getByText("This direct message is read-only right now.")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Messaging is disabled because the friendship is inactive or one user blocked the other.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unblock user" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      expect(screen.getByPlaceholderText("Write a direct message")).toBeDisabled();
    });
  });

  it("keeps an existing direct message visible after blocking the counterpart", async () => {
    let directMessages = [
      {
        id: "dm-block-1",
        counterpart_user_id: "user-9",
        counterpart_username: "block.target",
        counterpart_presence_status: "online",
        status: "active",
        created_at: "2026-04-19T19:00:00Z",
        is_initiator: true,
        can_message: true,
        unread_count: 0,
      },
    ];
    let friends = [
      {
        friendship_id: "friendship-block-1",
        user_id: "user-9",
        username: "block.target",
        friends_since: "2026-04-19T18:00:00Z",
        presence_status: "online",
      },
    ];
    let blockedUsers: Array<{
      block_id: string;
      blocked_user_id: string;
      blocked_username: string;
      reason: string | null;
      blocked_at: string;
    }> = [];

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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
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

      if (url.endsWith("/api/dms/dm-block-1")) {
        return new Response(JSON.stringify(directMessages[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/dm-block-1/messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: 201,
                conversation_id: "dm-block-1",
                author_user_id: "user-9",
                author_username: "block.target",
                body_text: "Existing history stays.",
                sequence_number: 4,
                created_at: "2026-04-19T19:02:00Z",
                updated_at: null,
                deleted_at: null,
                is_deleted: false,
                can_edit: false,
                can_delete: false,
                reply_to_message_id: null,
                reply_preview: null,
              },
            ],
            sequence_head: 4,
            oldest_loaded_sequence: 4,
            newest_loaded_sequence: 4,
            next_before_sequence: null,
            has_older: false,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/conversations/dm-block-1/read") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Conversation marked as read.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/friends") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ friends }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/friends/requests") && (!init?.method || init.method === "GET")) {
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

      if (url.endsWith("/api/blocks") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ blocked_users: blockedUsers }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/blocks") && init?.method === "POST") {
        blockedUsers = [
          {
            block_id: "block-keep-1",
            blocked_user_id: "user-9",
            blocked_username: "block.target",
            reason: null,
            blocked_at: "2026-04-19T19:05:00Z",
          },
        ];
        friends = [];
        directMessages = [
          {
            ...directMessages[0],
            status: "frozen",
            can_message: false,
            counterpart_presence_status: "offline",
          },
        ];

        return new Response(JSON.stringify(blockedUsers[0]), {
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
      expect(screen.getByRole("button", { name: "block.target online" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Block user" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "block.target offline" })).toBeInTheDocument();
      expect(screen.getByText("block.target blocked.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "block.target offline" }));

    await waitFor(() => {
      expect(screen.getByText("This direct message is read-only right now.")).toBeInTheDocument();
      expect(screen.getByText("Existing history stays.")).toBeInTheDocument();
    });
  });

  it("shows a friendly validation message when sign-in input is invalid", async () => {
    fetchMock.mockImplementationOnce(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    fetchMock.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          detail: [
            {
              type: "string_too_short",
              loc: ["body", "password"],
              msg: "String should have at least 8 characters",
            },
          ],
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    renderRoutes(["/signin"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "preview@agentic.chat" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "shortpwd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters long."),
      ).toBeInTheDocument();
    });
  });

  it("shows active sessions and revokes a selected session", async () => {
    let sessions = [
      {
        id: "session-current",
        user_agent: "Mozilla/5.0 Chrome/135.0",
        ip_address: "127.0.0.1",
        created_at: "2026-04-18T08:00:00Z",
        last_seen_at: "2026-04-18T08:05:00Z",
        expires_at: "2026-05-18T08:00:00Z",
        is_current: true,
      },
      {
        id: "session-other",
        user_agent: "Mozilla/5.0 Firefox/138.0",
        ip_address: "10.10.10.10",
        created_at: "2026-04-18T07:00:00Z",
        last_seen_at: "2026-04-18T07:30:00Z",
        expires_at: "2026-05-18T07:00:00Z",
        is_current: false,
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/auth/sessions") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ sessions }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/sessions/session-other") && init?.method === "DELETE") {
        sessions = sessions.filter((session) => session.id !== "session-other");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderRoutes(["/app/sessions"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Active sessions" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Chrome browser" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Firefox browser" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(screen.getByText("Selected session was revoked.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Firefox browser" })).not.toBeInTheDocument();
    });
  });

  it("shows the local Mailpit guidance after requesting password recovery", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/password/forgot") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            message:
              "If an account exists for this email, check Mailpit at http://localhost:8025 for the reset link.",
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

    renderRoutes(["/forgot-password"]);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "preview@agentic.chat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "If an account exists for this email, check Mailpit at http://localhost:8025 for the reset link.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("completes the password reset flow from the reset page", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ detail: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/password/reset/demo-token") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/api/auth/password/reset") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Password reset complete. Please sign in with your new password.",
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

    renderRoutes(["/reset-password?token=demo-token"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "brand-new-horse-battery-staple" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "brand-new-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password reset complete. Please sign in with your new password."),
      ).toBeInTheDocument();
    });
  });

  it("changes the password from the profile page and returns to sign in", async () => {
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
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/api/auth/password/change") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Password updated. Please sign in again with your new password.",
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

    renderRoutes(["/app/profile"]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Profile and password management" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "correct-horse-battery-staple" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "brand-new-horse-battery-staple" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "brand-new-horse-battery-staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
      expect(
        screen.getByText("Password updated. Please sign in again with your new password."),
      ).toBeInTheDocument();
    });
  });
});

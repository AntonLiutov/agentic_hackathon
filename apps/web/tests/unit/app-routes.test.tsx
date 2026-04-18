import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { AppRouter } from "../../src/app/router";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
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

    return new Response(JSON.stringify({ detail: "Unhandled request in test." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
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

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(
        screen.getByText("Member removed from the room and banned from rejoining."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(screen.getByText("By Preview User")).toBeInTheDocument();
      expect(screen.getByText("Removed by a room admin.")).toBeInTheDocument();
    });
  });

  it("opens a direct message from the contacts page", async () => {
    let directMessages = [
      {
        id: "dm-preview",
        counterpart_user_id: "user-2",
        counterpart_username: "existing.friend",
        counterpart_email: "friend@example.com",
        status: "active",
        created_at: "2026-04-18T09:00:00Z",
        is_initiator: false,
        can_message: true,
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

      if (url.endsWith("/api/dms") && init?.method === "POST") {
        const openedDirectMessage = {
          id: "dm-new",
          counterpart_user_id: "user-3",
          counterpart_username: "new.friend",
          counterpart_email: "new.friend@example.com",
          status: "active",
          created_at: "2026-04-18T10:00:00Z",
          is_initiator: true,
          can_message: true,
        };
        directMessages = [...directMessages, openedDirectMessage];

        return new Response(JSON.stringify(openedDirectMessage), {
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
      expect(screen.getAllByRole("heading", { name: "Direct messages" }).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Open direct message" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /existing\.friend/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new.friend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open direct message" }));

    await waitFor(() => {
      expect(screen.getByText("Direct message ready with new.friend.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "new.friend" })).toBeInTheDocument();
      expect(screen.getAllByText("new.friend@example.com").length).toBeGreaterThan(0);
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

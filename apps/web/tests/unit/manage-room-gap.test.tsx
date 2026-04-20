import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../src/app/providers";
import { AppRouter } from "../../src/app/router";

const fetchMock = vi.fn<typeof fetch>();

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

describe("Manage Room gap closure", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("supports member search, shows banned date/time, and saves room settings", async () => {
    const currentRoom = {
      id: "room-engineering",
      name: "engineering-room",
      description: "Coordination room for the main launch.",
      visibility: "private",
      owner_user_id: "user-1",
      member_count: 3,
      is_member: true,
      is_owner: true,
      is_admin: true,
      is_banned: false,
      can_join: false,
      can_leave: false,
      can_manage_members: true,
      joined_at: "2026-04-18T08:00:00Z",
      unread_count: 0,
    };

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
        return new Response(JSON.stringify({ rooms: [currentRoom] }), {
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
          JSON.stringify({ incoming_requests: [], outgoing_requests: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
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
                friendship_state: "none",
                presence_status: "online",
              },
              {
                id: "user-2",
                username: "admin.user",
                joined_at: "2026-04-18T08:05:00Z",
                is_owner: false,
                is_admin: true,
                can_remove: true,
                friendship_state: "none",
                presence_status: "online",
              },
              {
                id: "user-3",
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/bans")) {
        return new Response(
          JSON.stringify({
            bans: [
              {
                id: "ban-1",
                user_id: "user-8",
                username: "banned.user",
                banned_at: "2026-04-19T08:00:00Z",
                banned_by_username: "Preview User",
                reason: "Removed by a room admin.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/rooms/room-engineering/invitations")) {
        return new Response(JSON.stringify({ invitations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/api/conversations/room-engineering/messages") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            conversation_id: "room-engineering",
            sequence_head: 1,
            oldest_loaded_sequence: 1,
            newest_loaded_sequence: 1,
            next_before_sequence: null,
            has_older: false,
            messages: [],
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

      if (url.endsWith("/api/rooms/room-engineering") && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body));
        currentRoom.name = payload.name;
        currentRoom.description = payload.description;
        currentRoom.visibility = payload.visibility;

        return new Response(JSON.stringify(currentRoom), {
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

    let manageRoomButtons: HTMLElement[] = [];
    await waitFor(() => {
      manageRoomButtons = screen.getAllByRole("button", { name: "Manage room" });
      expect(manageRoomButtons.length).toBeGreaterThan(0);
    });

    fireEvent.click(manageRoomButtons[0]);

    let manageDialog: HTMLElement;
    await waitFor(() => {
      manageDialog = screen.getByRole("dialog", { name: /#engineering-room/i });
      expect(manageDialog).toBeInTheDocument();
    });

    const dialog = manageDialog!;

    fireEvent.change(within(dialog).getByPlaceholderText("Search member"), {
      target: { value: "room." },
    });

    await waitFor(() => {
      expect(within(dialog).getByText("room.member")).toBeInTheDocument();
      expect(within(dialog).queryByText("admin.user")).not.toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole("tab", { name: "Banned users" }));

    await waitFor(() => {
      expect(within(dialog).getByText("banned.user")).toBeInTheDocument();
      expect(within(dialog).getByText(/Apr/)).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole("tab", { name: "Settings" }));

    const roomNameInput = within(dialog).getByDisplayValue("engineering-room");
    fireEvent.change(roomNameInput, {
      target: { value: "engineering-hub" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Describe what this room is for"), {
      target: { value: "Updated room settings for the release crew." },
    });
    fireEvent.click(within(dialog).getByLabelText("Private"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Room settings updated for #engineering-hub.")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/rooms/room-engineering"),
      expect.objectContaining({
        method: "PATCH",
      }),
    );

    const patchCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        String(requestUrl).includes("/api/rooms/room-engineering") &&
        requestInit?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      name: "engineering-hub",
      description: "Updated room settings for the release crew.",
      visibility: "private",
    });
  });
});

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
      expect(screen.getByRole("heading", { name: "#engineering-room" })).toBeInTheDocument();
    });
    expect(screen.getByText("Preview User")).toBeInTheDocument();
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
});

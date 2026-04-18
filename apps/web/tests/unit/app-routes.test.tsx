import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppProviders } from "../../src/app/providers";
import { AppRouter } from "../../src/app/router";

beforeEach(() => {
  window.sessionStorage.clear();
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

  it("redirects anonymous users from protected routes to sign in", () => {
    renderRoutes(["/app/chats"]);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter workspace preview" })).toBeInTheDocument();
  });

  it("enters the protected workspace through preview sign-in", () => {
    renderRoutes(["/signin"]);

    fireEvent.click(screen.getByRole("button", { name: "Enter workspace preview" }));

    expect(screen.getByRole("heading", { name: "#engineering-room" })).toBeInTheDocument();
    expect(screen.getByText("Preview User")).toBeInTheDocument();
  });
});

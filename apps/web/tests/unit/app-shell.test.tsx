import { render, screen } from "@testing-library/react";

import App from "../../src/App";


describe("App shell", () => {
  it("renders the sprint foundation messaging", () => {
    render(<App />);

    expect(screen.getByText("Agentic Chat Foundation")).toBeInTheDocument();
    expect(screen.getByText("Sprint 1 / SP1-01")).toBeInTheDocument();
    expect(screen.getByText("Current focus")).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./workers/pyodide.client", () => ({
  pyodideClient: {
    isReady: vi.fn().mockResolvedValue(true),
    call: vi.fn(),
  },
}));

describe("App Integration", () => {
  it("renders and shows analysis engine status", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "EasyTableOne" })).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText(/Analysis engine ready/i)).toBeDefined();
    });
  });
});

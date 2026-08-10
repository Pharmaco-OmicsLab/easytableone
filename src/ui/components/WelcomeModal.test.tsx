import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../../store";
import WelcomeModal, { WELCOME_SEEN_KEY } from "./WelcomeModal";

describe("WelcomeModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStore.setState({ welcomeOpen: false, aboutOpen: false } as any);
  });

  it("renders null when closed", () => {
    render(<WelcomeModal />);
    expect(screen.queryByRole("dialog", { name: "Welcome to EasyTableOne" })).toBeNull();
  });

  it("marks the modal seen when closed", () => {
    useStore.setState({ welcomeOpen: true } as any);
    render(<WelcomeModal />);

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    expect(window.localStorage.getItem(WELCOME_SEEN_KEY)).toBe("1");
    expect(useStore.getState().welcomeOpen).toBe(false);
  });

  it("opens About from Learn more", () => {
    useStore.setState({ welcomeOpen: true, aboutOpen: false } as any);
    render(<WelcomeModal />);

    fireEvent.click(screen.getByRole("button", { name: "Learn more about us" }));

    expect(useStore.getState().welcomeOpen).toBe(false);
    expect(useStore.getState().aboutOpen).toBe(true);
  });
});

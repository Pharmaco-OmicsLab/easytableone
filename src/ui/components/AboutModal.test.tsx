import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TEAM } from "../../core/about/aboutContent";
import { APP_VERSION } from "../../core/appVersion";
import { journalRulesets } from "../../core/format/formatTable";
import { useStore } from "../../store";
import AboutModal from "./AboutModal";

describe("AboutModal", () => {
  beforeEach(() => {
    useStore.setState({ aboutOpen: false } as any);
  });

  it("renders null when closed", () => {
    render(<AboutModal />);
    expect(screen.queryByRole("dialog", { name: "About EasyTableOne" })).toBeNull();
  });

  it("renders team and legal sections without sibling app copy", () => {
    useStore.setState({ aboutOpen: true } as any);
    render(<AboutModal />);

    for (const member of TEAM) {
      expect(screen.getByText(member.name)).toBeDefined();
    }
    expect(screen.getByText("Privacy Policy")).toBeDefined();
    expect(screen.getByText("Terms of Service")).toBeDefined();
    expect(document.body.textContent).not.toContain("EasyFigAssembler");
  });

  it("shows the application and journal ruleset versions from their sources", () => {
    useStore.setState({ aboutOpen: true } as any);
    render(<AboutModal />);

    const version = screen.getByTestId("about-version");
    expect(version.textContent).toContain(`Version ${APP_VERSION}`);
    expect(version.textContent).toContain(`journal rulesets v${journalRulesets.EasyTableOne_Ruleset.version}`);
  });

  it("closes on Escape", () => {
    useStore.setState({ aboutOpen: true } as any);
    render(<AboutModal />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(useStore.getState().aboutOpen).toBe(false);
  });
});

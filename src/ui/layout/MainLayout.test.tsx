import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../../store";
import { WELCOME_SEEN_KEY } from "../components/WelcomeModal";
import { SMD_GLOSSARY } from "../../content/smdGuidance";
import MainLayout from "./MainLayout";

vi.mock("../../workers/pyodide.client", () => ({
  pyodideClient: {
    isReady: vi.fn(async () => true),
    restart: vi.fn(async () => true),
    detectRegime: vi.fn(async () => ({
      n: 0,
      events: 0,
      nonevents: 0,
      p: 0,
      epv: 0,
      pGeN: false,
      recommendedModels: [],
      plainMleAllowed: true,
      rationale: "",
    })),
    detectSeparation: vi.fn(async () => ({ separated: false, quasi: false, culprits: [] })),
  },
}));

describe("MainLayout help trigger", () => {
  beforeEach(() => {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
    useStore.setState({
      stage: 1,
      tutorialOpen: false,
      faqOpen: false,
      aboutOpen: false,
      welcomeOpen: false,
      setTutorialOpen: (open: boolean) => useStore.setState({ tutorialOpen: open }),
      setFaqOpen: (open: boolean) => useStore.setState({ faqOpen: open }),
    } as any);
  });

  it("renders the Help menu in the top bar and not in the rail bottom", () => {
    render(<MainLayout />);

    const topBar = screen.getByTestId("app-top-bar");
    const railBottom = screen.getByTestId("stage-rail-bottom");
    expect(within(topBar).getByRole("button", { name: "Help" })).toBeDefined();
    expect(within(railBottom).queryByRole("button", { name: "Open tutorial" })).toBeNull();
  });

  it("opens the tutorial from the top-bar help button", () => {
    render(<MainLayout />);

    fireEvent.click(within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open tutorial" }));
    expect(useStore.getState().tutorialOpen).toBe(true);
  });

  it("opens the FAQ from the top-bar FAQ button", () => {
    render(<MainLayout />);

    fireEvent.click(within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open FAQ" }));
    expect(useStore.getState().faqOpen).toBe(true);
  });

  it("opens the About modal from the top-bar info button", () => {
    render(<MainLayout />);

    fireEvent.click(within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "About EasyTableOne" }));
    expect(screen.getByRole("dialog", { name: "About EasyTableOne" })).toBeDefined();
    expect(useStore.getState().aboutOpen).toBe(true);
  });

  it("auto-opens the welcome modal only when the seen flag is missing", () => {
    window.localStorage.removeItem(WELCOME_SEEN_KEY);
    render(<MainLayout />);

    expect(screen.getByRole("dialog", { name: "Welcome to EasyTableOne" })).toBeDefined();
    expect(useStore.getState().welcomeOpen).toBe(true);
  });
});

describe("MainLayout responsive shell", () => {
  beforeEach(() => {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
    useStore.setState({
      stage: 1,
      modelingEnabled: false,
      tutorialOpen: false,
      faqOpen: false,
      aboutOpen: false,
      welcomeOpen: false,
      setTutorialOpen: (open: boolean) => useStore.setState({ tutorialOpen: open }),
      setFaqOpen: (open: boolean) => useStore.setState({ faqOpen: open }),
    } as any);
  });

  it("keeps the persistent desktop rail and exposes the mobile navigation trigger", () => {
    const { container } = render(<MainLayout />);

    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    expect(hamburger).toBeDefined();
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");
    expect(hamburger.getAttribute("aria-controls")).toBe("stage-drawer");

    const aside = container.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain("bg-white");
    expect(aside?.className).toContain("flex");
  });

  it("opens a modal drawer with stage navigation from the hamburger", async () => {
    render(<MainLayout />);

    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(hamburger);

    expect(hamburger.getAttribute("aria-expanded")).toBe("true");
    const drawer = screen.getByRole("dialog", { name: "Workflow" });
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
  });

  it("closes the drawer and updates the active stage when a drawer stage is selected", () => {
    useStore.setState({ stage: 2 } as any);
    render(<MainLayout />);

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Workflow" });
    fireEvent.click(within(drawer).getByRole("button", { name: /1\. Import data/ }));

    expect(screen.queryByRole("dialog", { name: "Workflow" })).toBeNull();
    expect(useStore.getState().stage).toBe(1);
  });

  it("shows the compact mobile stepper and keeps the desktop title node", () => {
    useStore.setState({ stage: 4 } as any);
    render(<MainLayout />);

    const topBar = screen.getByTestId("app-top-bar");
    expect(within(topBar).getByText("STEP 2 OF 7")).toBeDefined();
    expect(within(topBar).getByText("Variable types")).toBeDefined();

    const progress = within(topBar).getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("2");
    expect(progress.getAttribute("aria-valuemax")).toBe("7");
    expect(progress.getAttribute("aria-valuetext")).toBe("Step 2 of 7, Variable types");
  });

  it("closes on Escape and restores focus to the hamburger", async () => {
    render(<MainLayout />);

    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(hamburger);
    const drawer = screen.getByRole("dialog", { name: "Workflow" });
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Workflow" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(hamburger));
  });

  it("keeps top-bar controls reachable and uses responsive content padding", () => {
    const { container } = render(<MainLayout />);

    const topBar = screen.getByTestId("app-top-bar");
    expect(within(topBar).getByRole("button", { name: "Open navigation" })).toBeDefined();
    expect(within(topBar).getByRole("button", { name: "Save the current EasyTableOne session as JSON" })).toBeDefined();
    expect(within(topBar).getByRole("button", { name: "Help" })).toBeDefined();
    expect(within(topBar).getByRole("button", { name: "Concise" })).toBeDefined();
    expect(within(topBar).getByRole("button", { name: "Detailed" })).toBeDefined();

    const content = container.querySelector("#main");
    expect(content?.className).toContain("overflow-y-auto");

    const footer = container.querySelector("footer") as HTMLElement;
    expect(footer.className).toContain("border-t");
    expect(footer.className).toContain("flex-nowrap");
    expect(footer.className).toContain("py-4");
    expect(footer.className).not.toContain("bg-");
    const labLink = within(footer).getByRole("link", { name: "Empowered by Pharmaco-Omics Lab – Omics for Personalized Medicine" });
    expect(labLink.getAttribute("href")).toBe("https://github.com/Pharmaco-OmicsLab");
    const contactLink = within(footer).getByRole("link", { name: "Contact Us" });
    expect(contactLink.getAttribute("href")).toBe("mailto:pharmacoomicslab@gmail.com");
    expect(footer.querySelectorAll('a[href^="mailto:"]')).toHaveLength(1);
  });

  it("keeps vertical scrolling owned by the main content pane", () => {
    const { container } = render(<MainLayout />);

    const shell = container.firstElementChild;
    expect(shell?.className).toContain("h-full");
    expect(shell?.className).toContain("min-h-0");
    expect(shell?.className).toContain("overflow-hidden");

    const main = container.querySelector("#main");
    expect(main?.className).toContain("min-h-0");
    expect(main?.className).toContain("overflow-y-auto");
  });

  it("downloads a JSON session snapshot from the top bar", async () => {
    useStore.setState({
      data: {
        columns: [{ name: "age", originalName: "age" }],
        rows: [[42]],
        meta: { sourceFile: "study.csv", parseWarnings: [], locale: { decimalSeparator: ".", thousandSeparator: "," }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: "utf-8", missingSentinels: [] },
      },
      schema: { columns: [{ name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }] },
    } as any);
    const objectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:session");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<MainLayout />);
    fireEvent.click(within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Save the current EasyTableOne session as JSON" }));

    expect(objectUrlSpy).toHaveBeenCalled();
    const blob = objectUrlSpy.mock.calls[0][0] as Blob;
    const json = JSON.parse(await blob.text());
    expect(json.app).toBe("EasyTableOne");
    expect(json.data.rows).toEqual([[42]]);
    expect(json.schema.columns[0].name).toBe("age");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith("blob:session");

    clickSpy.mockRestore();
    revokeSpy.mockRestore();
    objectUrlSpy.mockRestore();
  });
});

describe("MainLayout navigation clarity", () => {
  beforeEach(() => {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
    useStore.setState({
      stage: 1,
      stats: null,
      modelingEnabled: false,
      tutorialOpen: false,
      faqOpen: false,
      aboutOpen: false,
      welcomeOpen: false,
      setTutorialOpen: (open: boolean) => useStore.setState({ tutorialOpen: open }),
      setFaqOpen: (open: boolean) => useStore.setState({ faqOpen: open }),
      setStage: (stage: number) => useStore.setState({ stage }),
      setModelingEnabled: (modelingEnabled: boolean) => useStore.setState({ modelingEnabled }),
    } as any);
  });

  it("renders seven grouped rail buttons, aria-current, and disabled gate hints", () => {
    const { container } = render(<MainLayout />);
    const rail = container.querySelector("aside nav") as HTMLElement;

    expect(rail.querySelectorAll(":scope > ol > li > button")).toHaveLength(7);
    const railLabels = Array.from(rail.querySelectorAll(":scope > ol > li > button")).map((button) => button.textContent ?? "");
    expect(railLabels.join(" ")).toContain("1. Import data");
    expect(railLabels.join(" ")).toContain("7. Format & export");
    expect(railLabels.some((label) => label.trim() === "Import data")).toBe(false);
    expect(within(rail).getByRole("button", { name: /1\. Import data/ })).toBeDefined();
    expect(within(rail).getByRole("button", { name: /2\. Variable types/ })).toBeDefined();
    expect(within(rail).getByRole("button", { name: /3\. Data checks/ })).toBeDefined();

    const active = within(rail).getByRole("button", { name: /1\. Import data/ });
    expect(active.getAttribute("aria-current")).toBe("step");

    const stage6 = within(rail).getByRole("button", { name: /4\. Analysis plan/ });
    expect(stage6.getAttribute("title")).toBe("Run the data checks before planning");
  });

  it.each([1, 2, 3])("keeps Import data active and progress at step 1 for internal stage %s", (stage: number) => {
    useStore.setState({ stage } as any);
    const { container } = render(<MainLayout />);
    const rail = container.querySelector("aside nav") as HTMLElement;

    expect(within(rail).getByRole("button", { name: /1\. Import data/ }).getAttribute("aria-current")).toBe("step");
    expect(within(screen.getByTestId("app-top-bar")).getByText("STEP 1 OF 7")).toBeDefined();
  });

  it("gates modeling until statistical review has results", () => {
    const { container } = render(<MainLayout />);
    const rail = container.querySelector("aside nav") as HTMLElement;

    const modeling = within(rail).getByRole("button", { name: /6\. Modeling \(optional\)/ });
    expect(modeling.hasAttribute("disabled")).toBe(true);
    expect(modeling.getAttribute("title")).toBe("Complete statistical review first");

    fireEvent.click(modeling);
    expect(useStore.getState().stage).toBe(1);
    expect(useStore.getState().modelingEnabled).toBe(false);
  });

  it("allows modeling opt-in after statistical review exists", () => {
    useStore.setState({ stage: 7, stats: { groups: [], perVariable: [], totalN: 0 }, modelingEnabled: false } as any);
    const { container } = render(<MainLayout />);
    const rail = container.querySelector("aside nav") as HTMLElement;

    const modeling = within(rail).getByRole("button", { name: /6\. Modeling \(optional\)/ });
    expect(modeling.textContent).toContain("Enable modeling");
    expect(modeling.hasAttribute("disabled")).toBe(false);
    fireEvent.click(modeling);

    expect(useStore.getState().stage).toBe(8);
    expect(useStore.getState().modelingEnabled).toBe(true);
  });

  it("renders glossary and opens the existing settings modal from help", () => {
    render(<MainLayout />);

    fireEvent.click(within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open tutorial" }));
    expect(screen.getByText("Glossary")).toBeDefined();
    expect(screen.getByText(SMD_GLOSSARY)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeDefined();
    const checkbox = screen.getByRole("checkbox", { name: /Include input data hash/ });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(checkbox);
    expect(useStore.getState().includeInputDataHashInRepro).toBe(true);
  });

  it("renders each stage 1–9 inside main#main", () => {
    const { container } = render(<MainLayout />);
    const main = container.querySelector("main#main")!;
    for (let stage = 1; stage <= 9; stage++) {
      act(() => useStore.setState({ stage } as any));
      expect(main.contains(container.querySelector("#main-scroll-container")?.firstElementChild ?? null)).toBe(true);
      expect(container.querySelector("#main-scroll-container")?.firstElementChild).toBeTruthy();
    }
  });

  it("closes Help with Escape and restores focus to its button", async () => {
    render(<MainLayout />);
    const help = within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" });
    fireEvent.click(help);
    const menuItem = screen.getByRole("menuitem", { name: "Open tutorial" });
    await waitFor(() => expect(document.activeElement).toBe(menuItem));
    fireEvent.keyDown(menuItem, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it("closes Help on an outside pointerdown without moving focus", async () => {
    render(<MainLayout />);
    const help = within(screen.getByTestId("app-top-bar")).getByRole("button", { name: "Help" });
    fireEvent.click(help);
    await waitFor(() => expect(screen.getByRole("menu")).toBeDefined());
    const outside = screen.getByRole("main");
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("keeps workflow gate description IDs unique while the drawer is open", () => {
    render(<MainLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const ids = Array.from(document.querySelectorAll<HTMLElement>('[id^="workflow-gate-"]'), (element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

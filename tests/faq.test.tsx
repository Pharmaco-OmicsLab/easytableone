import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/store";
import FaqModal from "../src/ui/components/FaqModal";
import { FAQ_CATEGORIES, FAQ_ITEMS } from "../src/ui/components/faqContent";

describe("FAQ content", () => {
  it("contains all FAQ items and only known categories", () => {
    expect(FAQ_ITEMS).toHaveLength(89);
    expect(FAQ_ITEMS.every((item) => FAQ_CATEGORIES.includes(item.category))).toBe(true);
  });

  it("search text includes detail-only terms", () => {
    expect(FAQ_ITEMS.some((item) => item.search.includes("firthlogist"))).toBe(true);
  });

  it("keeps outcome-aware imputation copy aligned to method-specific defaults", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question.includes("outcome-aware imputation"));
    expect(item).toBeDefined();
    const text = item?.search ?? "";
    expect(text).toContain("on by default for mice");
    expect(text).toContain("off by default for knn and random forest");
    expect(text).toContain("fold-locally on predictors only");
    expect(text).not.toContain("default for those methods");
  });

  it("surfaces the Firth and median-vs-mean wording updates", () => {
    expect(FAQ_ITEMS.some((item) => item.search.includes("firth's penalized logistic regression"))).toBe(true);
    const imputationItem = FAQ_ITEMS.find((candidate) => candidate.question === "What imputation methods are supported?");
    expect(imputationItem?.search).toContain("median fill is usually safer than mean");
  });

  it("adds the TRIPOD+AI support answer with the compliance boundary", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question === "Does EasyTableOne follow TRIPOD+AI reporting guidelines?");
    expect(item).toBeDefined();
    expect(item?.search).toContain("tripod+ai");
    expect(item?.search).toContain("does not make your study compliant");
    expect(item?.search).toContain("logistic performance confidence intervals where resampling supports them");
    expect(item?.search).toContain("ml intervals across cv repetitions");
    expect(item?.search).toContain("decision-curve/net-benefit analysis");
    expect(item?.search).toContain("opt-in subgroup discrimination and calibration");
  });

  it("explains opt-in fairness subgroup performance without certifying fairness", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question === "Can EasyTableOne check my model for fairness across subgroups?");
    expect(item).toBeDefined();
    expect(item?.search).toContain("does not certify that a model is fair");
    expect(item?.search).toContain("held-out or validation-appropriate predictions");
    expect(item?.search).toContain("too few events or non-events");
    expect(item?.search).toContain("mitigation remain author-owned");
  });

  it("explains decision curves and net benefit", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question === "What is a decision curve / net benefit, and how do I read it?");
    expect(item).toBeDefined();
    expect(item?.search).toContain("threshold probability");
    expect(item?.search).toContain("treat all");
    expect(item?.search).toContain("treat none");
    expect(item?.search).toContain("logistic decision-curve coordinates are labeled apparent");
    expect(item?.search).toContain("ml decision curves use pooled repeated-cv held-out predictions");
  });

  it("explains performance CIs without relabelling ML SD", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question === "How are confidence intervals computed (Wald versus bootstrap)?");
    expect(item).toBeDefined();
    expect(item?.search).toContain("logistic validation scalars use out-of-bag, nested, or full-sample bootstrap confidence intervals");
    expect(item?.search).toContain("machine-learning metrics use a 95% interval across cv repetitions");
    expect(item?.search).toContain("+/- sd value is per-repeat spread, not a confidence interval");
    expect(item?.search).toContain("not confidence intervals for performance on new patients");
  });

  it("explains imbalance handling and the classification threshold", () => {
    const item = FAQ_ITEMS.find((candidate) => candidate.question === "How does Modeling handle class imbalance and classification thresholds?");
    expect(item).toBeDefined();
    expect(item?.search).toContain("does not oversample");
    expect(item?.search).toContain("threshold of 0.50");
    expect(item?.search).toContain("auc and roc curves are threshold-free");
  });

  it("explains Fast vs Thorough validation and validation CI methods", () => {
    const fastThorough = FAQ_ITEMS.find((candidate) => candidate.question === "What's the difference between Fast and Thorough validation?");
    expect(fastThorough?.search).toContain("200 resamples, single imputation for mice");
    expect(fastThorough?.search).toContain("1000 resamples, re-runs the full imputation");
    expect(fastThorough?.search).toContain("odds ratios are identical either way");
    expect(fastThorough?.search).not.toContain("point estimates (odds ratios, auc, etc.) remain identical");

    const validationCi = FAQ_ITEMS.find((candidate) => candidate.question === "Which validation CI method should I use?");
    expect(validationCi).toBeDefined();
    expect(validationCi?.search).toContain("out-of-bag (oob) is the recommended default");
    expect(validationCi?.search).toContain("nested bootstrap runs a double bootstrap loop");
    expect(validationCi?.search).toContain("full-sample bootstrap (legacy) computes percentile intervals");
  });
});

describe("FaqModal", () => {
  beforeEach(() => {
    useStore.setState({
      faqOpen: false,
      setFaqOpen: (open: boolean) => useStore.setState({ faqOpen: open }),
    } as any);
  });

  it("renders the FAQ title when open", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    expect(document.getElementById("faq-modal-title")?.textContent).toBe("Frequently asked questions");
    expect(screen.getByRole("dialog", { name: "Frequently asked questions" })).toBeDefined();
  });

  it("closes on close-button click", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    fireEvent.click(document.getElementById("faq-close-button")!);
    expect(useStore.getState().faqOpen).toBe(false);
  });

  it("closes on backdrop click", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    fireEvent.click(screen.getByRole("dialog", { name: "Frequently asked questions" }));
    expect(useStore.getState().faqOpen).toBe(false);
  });

  it("filters questions case-insensitively from the search input", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    fireEvent.change(document.getElementById("faq-search-input")!, { target: { value: "pyodide" } });

    expect(screen.getByText("What is Pyodide, and why is the first load slow?")).toBeDefined();
    expect(screen.queryByText("Who is this tool for?")).toBeNull();
  });

  it("filters to a selected category", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    fireEvent.click(screen.getByRole("button", { name: "Troubleshooting" }));

    expect(screen.getByText("The analysis engine won't start / is stuck on yellow.")).toBeDefined();
    expect(screen.queryByText("What is EasyTableOne and what does it do?")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Troubleshooting" })).toBeNull();
  });

  it("renders the empty state and clear-filters action", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    fireEvent.click(screen.getByRole("button", { name: "Troubleshooting" }));
    fireEvent.change(document.getElementById("faq-search-input")!, { target: { value: "zzzz-no-match" } });

    expect(screen.getByText("No questions match your search.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("What is EasyTableOne and what does it do?")).toBeDefined();
  });

  it("renders the citation placeholder in red", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    const citation = screen.getByText("[CITATION PLACEHOLDER — TO BE FINALIZED]");
    expect(citation).toBeDefined();
    expect(citation.tagName).toBe("STRONG");
    expect((citation as HTMLElement).style.color).toBe("red");
  });

  it("keeps More detail disclosures closed by default", () => {
    useStore.setState({ faqOpen: true });
    render(<FaqModal />);

    const article = screen.getByText("What is EasyTableOne and what does it do?").closest("article")!;
    const disclosure = within(article).getByText("More detail").closest("details")!;
    expect(disclosure.hasAttribute("open")).toBe(false);
  });
});

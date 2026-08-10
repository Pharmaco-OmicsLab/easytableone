import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GlossaryTerm from "./GlossaryTerm";
import { GLOSSARY } from "./glossary";

describe("GlossaryTerm", () => {
  it("resolves new imputation glossary terms", () => {
    expect(GLOSSARY.kNN).toContain("Nearest-neighbour");
    expect(GLOSSARY.MICE).toContain("Multiple imputation");
    expect(GLOSSARY["Rubin's rules"]).toContain("combining");

    render(<GlossaryTerm term="MICE" />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "MICE" }));
    expect(screen.getByRole("tooltip").textContent).toContain("plausible completed datasets");
  });
});

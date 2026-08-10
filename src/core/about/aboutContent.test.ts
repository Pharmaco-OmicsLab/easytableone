import { describe, expect, it } from "vitest";
import { DIFFERENTIATORS, PRIVACY_POLICY_TEXT, TEAM, TERMS_OF_SERVICE_TEXT } from "./aboutContent";

describe("about content", () => {
  it("keeps the welcome differentiators and team roles stable", () => {
    expect(DIFFERENTIATORS).toHaveLength(5);
    expect(TEAM.map((member) => member.role)).toEqual(["Principal Investigator", "Main Contributor", "Contributor(s)"]);
  });

  it("does not leak sibling-app or cloud opt-in copy", () => {
    const text = `${PRIVACY_POLICY_TEXT}\n${TERMS_OF_SERVICE_TEXT}`;
    expect(text).not.toContain("EasyFigAssembler");
    expect(text.toLowerCase()).not.toContain("unless you opt");
    expect(text.toLowerCase()).not.toContain("cloud storage");
  });
});

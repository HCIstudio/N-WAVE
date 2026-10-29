import { describe, expect, it } from "vitest";
import { nameForEditing, nameFromEditing, UNTITLED_WORKFLOW } from "./workflowName";

describe("workflow names in name fields", () => {
  it("starts an unnamed workflow's field empty", () => {
    expect(nameForEditing(UNTITLED_WORKFLOW)).toBe("");
    expect(nameForEditing("rnaseq")).toBe("rnaseq");
  });

  it("saves an empty field as unnamed", () => {
    expect(nameFromEditing("  ")).toBe(UNTITLED_WORKFLOW);
    expect(nameFromEditing("rnaseq")).toBe("rnaseq");
  });
});

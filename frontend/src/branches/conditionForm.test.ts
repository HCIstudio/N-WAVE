import { describe, expect, it } from "vitest";
import { comparisonsFor, readCondition, writeCondition } from "./conditionForm";

describe("a branch's condition as a form", () => {
  it("reads the common conditions: a value compared, a switch on or off", () => {
    expect(readCondition("params.aligner == 'star'")).toEqual({ parameter: "aligner", comparison: "is", value: "star" });
    expect(readCondition("params.aligner != \"hisat2\"")).toEqual({ parameter: "aligner", comparison: "isNot", value: "hisat2" });
    expect(readCondition("params.depth >= 10")).toEqual({ parameter: "depth", comparison: "ge", value: "10" });
    expect(readCondition("params.skip_qc")).toEqual({ parameter: "skip_qc", comparison: "isTrue", value: "" });
    expect(readCondition("!params.skip_qc")).toEqual({ parameter: "skip_qc", comparison: "isFalse", value: "" });
    expect(readCondition("params.trim == false")).toEqual({ parameter: "trim", comparison: "isFalse", value: "" });
    expect(readCondition("params.name == 'it\\'s'")).toEqual({ parameter: "name", comparison: "is", value: "it's" });
  });

  it("leaves everything else as code", () => {
    for (const code of ["params.depth > 10 && params.trim", "params.a == params.b", "workflow.profile == 'test'", "params.x.size() > 2", "params.x == \"${y}\"", ""]) {
      expect(readCondition(code), code).toBeNull();
    }
  });

  it("writes text quoted and numbers as they are, by the parameter's type", () => {
    expect(writeCondition({ parameter: "aligner", comparison: "is", value: "star" }, "text")).toBe("params.aligner == 'star'");
    expect(writeCondition({ parameter: "aligner", comparison: "is", value: "3" }, "text")).toBe("params.aligner == '3'");
    expect(writeCondition({ parameter: "depth", comparison: "gt", value: "10" }, "number")).toBe("params.depth > 10");
    expect(writeCondition({ parameter: "skip_qc", comparison: "isFalse", value: "" }, "boolean")).toBe("!params.skip_qc");
    expect(writeCondition({ parameter: "name", comparison: "is", value: "it's" }, "text")).toBe("params.name == 'it\\'s'");
    // Incomplete: nothing yet.
    expect(writeCondition({ parameter: "", comparison: "is", value: "x" }, "text")).toBeNull();
    expect(writeCondition({ parameter: "depth", comparison: "gt", value: " " }, "number")).toBeNull();
  });

  it("offers the comparisons that fit the parameter's type, and reads back what it writes", () => {
    expect(comparisonsFor("boolean")).toEqual(["isTrue", "isFalse"]);
    expect(comparisonsFor("text")).toEqual(["is", "isNot"]);
    expect(comparisonsFor("number")).toContain("lt");
    const form = { parameter: "depth", comparison: "le" as const, value: "2.5" };
    expect(readCondition(writeCondition(form, "number") as string)).toEqual(form);
  });
});

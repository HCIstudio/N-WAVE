import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkReferences, parseBioflowResult } from "./bioflowResult";

// The outputs the contract tests record (backend/bioflow/tests/expected).
const expectedDir = path.join(__dirname, "..", "..", "bioflow", "tests", "expected");
const recorded = fs.readdirSync(expectedDir).filter((file) => file.endsWith(".json"));
const read = (file: string) => fs.readFileSync(path.join(expectedDir, file), "utf8");

describe("parseBioflowResult", () => {
  it.each(recorded)("accepts the recorded output %s", (file) => {
    expect(() => parseBioflowResult(read(file))).not.toThrow();
  });

  it("reads steps, connections, subworkflows and conditions", () => {
    const result = parseBioflowResult(read("subworkflows.json"));
    expect(result.steps.map((step) => step.id)).toContain("GENOME.STATS_INDEX");
    expect(result.subworkflows.find((sub) => sub.id === "GENOME")?.workflow).toBe("PREPARE_GENOME");
    const conditions = parseBioflowResult(read("conditions.json"));
    expect(conditions.steps.find((step) => step.id === "TRIM")?.conditions).toEqual(["params.trim"]);
  });

  it("refuses what isn't N-WAVE's JSON", () => {
    expect(() => parseBioflowResult("not json")).toThrow("did not return JSON");
    const other = { ...JSON.parse(read("conditions.json")), schema: "n-wave-bioflow/2" };
    expect(() => parseBioflowResult(JSON.stringify(other))).toThrow("doesn't know");
  });

  it("refuses references to steps that don't exist", () => {
    const result = JSON.parse(read("conditions.json"));
    result.connections.push({ from: "TRIM", to: "NOWHERE" });
    expect(() => parseBioflowResult(JSON.stringify(result))).toThrow("unknown step NOWHERE");
  });

  it("checks subworkflows and group parents", () => {
    const result = parseBioflowResult(read("subworkflows.json"));
    const broken = {
      ...result,
      steps: result.steps.map((step) => ({ ...step, subworkflow: step.subworkflow ? "GONE" : null })),
      groups: { ...result.groups, dominator: [{ steps: [], parent: 0 }] },
    };
    const problems = checkReferences(broken);
    expect(problems.some((problem) => problem.includes("unknown subworkflow GONE"))).toBe(true);
    expect(problems).toContain("a dominator group's parent comes after it");
  });
});

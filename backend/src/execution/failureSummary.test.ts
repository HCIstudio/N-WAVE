import { describe, expect, it } from "vitest";
import { summarizeFailure } from "./failureSummary";

describe("summarizeFailure", () => {
  it("uses Nextflow's ERROR line and its cause", () => {
    const output = [
      "N-WAVE run: bee_1",
      "curl: (22) The requested URL returned error: 403",
      "[ab/123456] process > COUNT (1) [100%] 1 of 1, failed: 1 ✘",
      "ERROR ~ Error executing process > 'COUNT (1)'",
      "",
      "Caused by:",
      "  Process `COUNT (1)` terminated with an error exit status (127)",
      "",
      "Command error:",
      "  .command.sh: line 2: wc: command not found",
      "",
      " -- Check '.nextflow.log' file for details",
    ].join("\n");
    expect(summarizeFailure(output)).toBe(
      "Error executing process > 'COUNT (1)': Process `COUNT (1)` terminated with an error exit status (127)"
    );
  });

  it("falls back to the last line, where error() puts its message", () => {
    const output = "N E X T F L O W\nLaunching `main.nf`\n\ndeliberate failure\n";
    expect(summarizeFailure(output)).toBe("deliberate failure");
  });

  it("returns nothing for no output", () => {
    expect(summarizeFailure("\n \n")).toBeUndefined();
  });
});

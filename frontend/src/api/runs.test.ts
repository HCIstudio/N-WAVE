import { describe, expect, it } from "vitest";
import { runResultUrl, taskFileUrl } from "./runs";

describe("run file URLs", () => {
  it("are path-style, so a report's relative links reach its siblings", () => {
    const report = runResultUrl("demo_1", "multiqc/report one.html");
    expect(report).toBe("/api/execute/runs/demo_1/results/multiqc/report%20one.html");
    expect(new URL("report_files/plot.png", `http://n-wave${report}`).pathname).toBe(
      "/api/execute/runs/demo_1/results/multiqc/report_files/plot.png",
    );
    expect(taskFileUrl("demo_1", "ab/cdef12", "out/a#1.txt")).toBe(
      "/api/execute/runs/demo_1/tasks/ab/cdef12/output/out/a%231.txt",
    );
  });
});

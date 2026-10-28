import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn(() => true);
vi.mock("./notifications", () => ({ notify }));
const { formatDuration, notifyRunEnded, runPath } = await import("./runNotifications");

describe("run notifications", () => {
  beforeEach(() => notify.mockClear());

  it("says how long a run took", () => {
    expect(formatDuration(40_000)).toBe("40 s");
    expect(formatDuration(3 * 60_000)).toBe("3 min");
    expect(formatDuration(64 * 60_000 + 14_000)).toBe("1 h 4 min");
    expect(formatDuration(120 * 60_000)).toBe("2 h");
  });

  it("names the workflow, the outcome and why it failed", () => {
    notifyRunEnded({ runId: "r1", workflowId: "wf", workflowName: "rnaseq", outcome: "succeeded", durationMs: 3_854_000 });
    expect(notify).toHaveBeenLastCalledWith("runSucceeded", {
      title: "rnaseq finished",
      body: "The run succeeded after 1 h 4 min. Click to see its results.",
      tag: "run-r1",
      path: "/workflow/wf?run=r1",
    });
    notifyRunEnded({ runId: "r2", workflowId: "wf", workflowName: "rnaseq", outcome: "failed", reason: "A program the step needs isn't installed" });
    expect(notify).toHaveBeenLastCalledWith(
      "runFailed",
      expect.objectContaining({
        title: "rnaseq failed",
        body: "A program the step needs isn't installed. Click to see what went wrong.",
      }),
    );
    notifyRunEnded({ runId: "r3", outcome: "cancelled" });
    expect(notify).toHaveBeenLastCalledWith(
      "runFailed",
      expect.objectContaining({ title: "A workflow was stopped", path: "/" }),
    );
  });

  it("opens the workflow with the run", () => {
    expect(runPath("a b", "r 1")).toBe("/workflow/a%20b?run=r%201");
    expect(runPath("wf", null)).toBe("/workflow/wf");
  });
});

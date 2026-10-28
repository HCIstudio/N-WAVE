import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSummary } from "../../api/runs";

const notifyRunEnded = vi.fn();
vi.mock("../../notifications/runNotifications", () => ({ notifyRunEnded }));
const { notifyEndedRuns } = await import("./useRunsOverview");

const run = (id: string, status: RunSummary["status"], extra: Partial<RunSummary> = {}): RunSummary => ({
  id,
  status,
  workflowId: "wf",
  workflowName: "mag",
  startedAt: "2026-10-27T11:16:49Z",
  ...extra,
});

describe("notifyEndedRuns", () => {
  beforeEach(() => notifyRunEnded.mockClear());

  it("notifies about the runs that were going on and have ended", () => {
    notifyEndedRuns(
      [
        run("a", "succeeded", { finishedAt: "2026-10-27T12:18:11Z" }),
        run("b", "failed", { message: "Out of memory" }),
        run("c", "running"),
        run("d", "succeeded"),
      ],
      new Set(["a", "b", "c"]),
    );
    expect(notifyRunEnded.mock.calls.map(([call]) => call)).toEqual([
      { runId: "a", workflowId: "wf", workflowName: "mag", outcome: "succeeded", durationMs: 3_682_000 },
      { runId: "b", workflowId: "wf", workflowName: "mag", outcome: "failed", reason: "Out of memory" },
    ]);
  });
});

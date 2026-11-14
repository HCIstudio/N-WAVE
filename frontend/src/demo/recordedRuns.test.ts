import { describe, expect, it } from "vitest";
import { answerRecordedRun, listRecordedRuns, RECORDED_RUN_NOTE } from "./recordedRuns";
import demoApi from "./demoApi";

describe("the demo's recorded runs", () => {
  it("has a run of Demo 1 and of Demo 3, each with its trace and tasks", async () => {
    const demo1 = await listRecordedRuns("builtin:demo-basic");
    const demo3 = await listRecordedRuns("builtin:rnaseq-star-salmon");
    expect(demo1).toHaveLength(1);
    expect(demo3).toHaveLength(1);
    expect(await listRecordedRuns("builtin:rnaseq-pipeline")).toEqual([]);
    for (const run of [...demo1, ...demo3]) {
      expect(run.status).toBe("succeeded");
      const trace = await answerRecordedRun(`/execute/runs/${run.id}/trace`, {});
      const tasks = await answerRecordedRun(`/execute/runs/${run.id}/tasks`, {});
      const traced = (trace?.data as { tasks: Array<{ hash: string; rchar: number | null }> } | undefined)?.tasks ?? [];
      const logged = (tasks?.data as { tasks: Array<{ hash: string }> } | undefined)?.tasks ?? [];
      expect(traced.length).toBeGreaterThan(0);
      // Recorded since v1.7: every task has its bytes.
      expect(traced.every((task) => typeof task.rchar === "number")).toBe(true);
      // The trace's tasks are the log's (the same hashes), so nodes find their numbers.
      expect(new Set(traced.map((task) => task.hash))).toEqual(new Set(logged.map((task) => task.hash)));
    }
  });

  it("answers like the API, through the demo client", async () => {
    const { data } = await demoApi.get<{ runs: Array<{ id: string }> }>("/execute/runs", {
      params: { workflowId: "builtin:demo-basic" },
    });
    expect(data.runs).toHaveLength(1);
    const id = data.runs[0]?.id ?? "";
    const reports = await demoApi.get(`/execute/runs/${encodeURIComponent(id)}/reports`);
    // No HTML reports in the demo: it can't serve them.
    expect(reports.data).toEqual({ report: false, timeline: false, trace: true });
    await expect(demoApi.get(`/execute/runs/${encodeURIComponent(id)}/tasks/aa/bbbbbb/files`)).rejects.toMatchObject({
      response: { status: 404, data: { message: RECORDED_RUN_NOTE } },
    });
    await expect(demoApi.get("/execute/runs/nope_1/trace")).rejects.toMatchObject({ response: { status: 404 } });
    const all = await demoApi.get<{ runs: unknown[] }>("/execute/runs?limit=1");
    expect(all.data.runs).toHaveLength(1);
  });
});

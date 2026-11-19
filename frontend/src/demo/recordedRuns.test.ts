import { describe, expect, it } from "vitest";
import {
  answerRecordedRun,
  listRecordedRuns,
  nextflowLogTime,
  placeRecordedRun,
  RECORDED_RUN_NOTE,
  type StoredRun,
} from "./recordedRuns";
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

  it("keeps no dates: times count from the run's creation, and the id ends in 0", () => {
    const stored = import.meta.glob<StoredRun>("./recordedRuns/*.json", { import: "default", eager: true });
    const day = 24 * 60 * 60 * 1000;
    expect(Object.keys(stored)).toHaveLength(2);
    for (const recording of Object.values(stored)) {
      expect(recording.run.id).toMatch(/_0$/);
      expect(recording.run.startedAt).toBeGreaterThanOrEqual(0);
      expect(recording.run.finishedAt).toBeLessThan(day);
      for (const task of recording.trace) {
        for (const time of [task.submit, task.start, task.complete]) expect(Math.abs(time ?? 0)).toBeLessThan(day);
      }
      const text = JSON.stringify(recording);
      // No ISO date, no date as Nextflow writes it, no epoch milliseconds or seconds.
      expect(text).not.toMatch(/\d{4}-\d\d-\d\dT|\d\d-[A-Z][a-z]{2}-\d{4}|(?<![\d.])1[6-9]\d{11}(?!\d)|(?<![\d.])1[6-9]\d{8}\.\d/);
    }
  });

  it("places a recording as a run that has just finished", () => {
    const stored: StoredRun = {
      run: { id: "Bee_0", status: "succeeded", startedAt: 3, finishedAt: 60_003 },
      log: "Completed at: {completedAt}\n",
      reports: { report: false, timeline: false, trace: true },
      tasks: [],
      trace: [{ submit: 1000, start: 1100, complete: 31_100 } as StoredRun["trace"][number]],
    };
    const now = Date.UTC(2030, 0, 2, 3, 4, 5);
    const placed = placeRecordedRun(stored, now);
    expect(placed.run.finishedAt).toBe(new Date(now).toISOString());
    expect(placed.run.startedAt).toBe(new Date(now - 60_000).toISOString());
    expect(placed.trace[0]).toMatchObject({ submit: now - 59_003, start: now - 58_903, complete: now - 28_903 });
    expect(placed.log).toBe(`Completed at: ${nextflowLogTime(now)}\n`);
    expect(nextflowLogTime(new Date(2030, 10, 4, 5, 6, 7).getTime())).toBe("04-Nov-2030 05:06:07");
  });
});

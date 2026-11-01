import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "./activityEvents";
import { filterActivity, markedTests } from "./activityEvents";
import { activityCsv, activityZipEntries, buildActivityZip, bugReportText, splitSnapshots } from "./activityExport";

const event = (id: string, time: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  time,
  type: "ui.click",
  session: "s1",
  ...extra,
});

const events: ActivityEvent[] = [
  event("before", "2026-11-01T09:00:00.000Z"),
  event("start", "2026-11-01T10:00:00.000Z", { type: "test.started", test: "t1", data: { label: "P01" } }),
  event("run", "2026-11-01T10:01:00.000Z", {
    type: "run.started",
    test: "t1",
    data: { resume: false, snapshot: { nodes: [{ id: "a" }], edges: [] } },
  }),
  event("end", "2026-11-01T10:05:00.000Z", { type: "test.ended", test: "t1", data: { label: "P01" } }),
  event("after", "2026-11-02T08:00:00.000Z", { data: { name: 'Say "hi", then go' } }),
];

describe("activity export", () => {
  it("filters by time and by marked test", () => {
    expect(filterActivity(events, { from: "2026-11-01T10:00:00.000Z", to: "2026-11-02T00:00:00.000Z" }).map((e) => e.id)).toEqual([
      "start",
      "run",
      "end",
    ]);
    expect(filterActivity(events, { test: "t1" }).map((e) => e.id)).toEqual(["start", "run", "end"]);
    expect(markedTests(events)).toEqual([
      { id: "t1", label: "P01", startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T10:05:00.000Z" },
    ]);
  });

  it("moves each run's snapshot into a file of its own", () => {
    const { events: lean, snapshots } = splitSnapshots(events);
    expect(lean[2].data).toEqual({ resume: false, snapshotFile: "snapshots/run.json" });
    expect(snapshots).toEqual({ "snapshots/run.json": { nodes: [{ id: "a" }], edges: [] } });
  });

  it("writes CSV with quoting where needed", () => {
    const [header, , , , , last] = activityCsv(events).split("\n");
    expect(header).toBe("time,type,session,participant,test,workflowId,path,data");
    expect(last).toBe('2026-11-02T08:00:00.000Z,ui.click,s1,,,,,"{""name"":""Say \\""hi\\"", then go""}"');
  });

  it("zips JSON Lines, CSV, the snapshots and a README; a test's export holds only that test", async () => {
    const test = filterActivity(events, { test: "t1" });
    const files = unzipSync(new Uint8Array(await (await buildActivityZip(test)).arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "events.csv", "events.jsonl", "snapshots/run.json"]);
    const lines = strFromU8(files["events.jsonl"]).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((line) => line.id)).toEqual(["start", "run", "end"]);
    expect(lines.every((line) => line.test === "t1")).toBe(true);
    expect(JSON.parse(strFromU8(files["snapshots/run.json"]))).toEqual({ nodes: [{ id: "a" }], edges: [] });
    expect(activityZipEntries([])["events.jsonl"]).toBe("");
  });

  it("copies the last minutes for a bug report, without snapshots", () => {
    const text = bugReportText(events, Date.parse("2026-11-01T10:06:00.000Z"));
    expect(text.split("\n")[0]).toBe("N-WAVE activity, last 10 minutes (4 events):");
    expect(text).toContain('"snapshotFile":"snapshots/run.json"');
    expect(text).not.toContain('"before"');
    expect(text.endsWith("```")).toBe(true);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

const event = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
  id,
  time,
  type: "ui.click",
  session: "s1",
  data: { name: "Run" },
  ...extra,
});

const record = (events: unknown[]) => request(createApp()).post("/api/activity").send({ events });

describe("activity routes", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-activity-"));
    process.env.NWAVE_DATA_DIR = root;
  });
  afterEach(() => {
    Reflect.deleteProperty(process.env, "NWAVE_DATA_DIR");
    vi.unstubAllEnvs();
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const turnOn = () =>
    request(createApp())
      .put("/api/settings/features")
      .send({ features: { verbose: true } });

  it("records nothing while verbose mode is off", async () => {
    const response = await record([event("a", "2026-11-01T10:00:00.000Z")]);
    expect(response.body).toEqual({ recorded: 0 });
    expect(fs.existsSync(path.join(root, "activity.jsonl"))).toBe(false);
    expect((await request(createApp()).get("/api/activity")).body.events).toEqual([]);
  });

  it("keeps events as JSON lines and reads them back by time", async () => {
    await turnOn();
    expect((await record([event("a", "2026-11-01T10:00:00.000Z")])).body).toEqual({ recorded: 1 });
    await record([event("b", "2026-11-01T11:00:00.000Z"), event("c", "2026-11-02T09:00:00.000Z")]);
    const lines = fs.readFileSync(path.join(root, "activity.jsonl"), "utf8").trim().split("\n");
    expect(lines.map((line) => JSON.parse(line).id)).toEqual(["a", "b", "c"]);

    const all = await request(createApp()).get("/api/activity");
    expect(all.body.events.map((e: { id: string }) => e.id)).toEqual(["a", "b", "c"]);
    const day = await request(createApp())
      .get("/api/activity")
      .query({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-02T00:00:00.000Z" });
    expect(day.body.events.map((e: { id: string }) => e.id)).toEqual(["a", "b"]);
  });

  it("refuses events that don't fit the format", async () => {
    await turnOn();
    expect((await record([{ id: "a", type: "ui.click" }])).status).toBe(400);
    expect((await record([{ ...event("a", "2026-11-01T10:00:00.000Z"), name: "Ada" }])).status).toBe(400);
  });

  it("lists the marked tests and exports one of them on its own", async () => {
    await turnOn();
    await record([
      event("before", "2026-11-01T09:00:00.000Z"),
      event("start", "2026-11-01T10:00:00.000Z", { type: "test.started", test: "t1", data: { label: "P01" } }),
      event("click", "2026-11-01T10:01:00.000Z", { test: "t1" }),
      event("end", "2026-11-01T10:05:00.000Z", { type: "test.ended", test: "t1", data: {} }),
      event("after", "2026-11-01T10:06:00.000Z"),
    ]);
    const summary = await request(createApp()).get("/api/activity/summary");
    expect(summary.body).toMatchObject({
      events: 5,
      oldest: "2026-11-01T09:00:00.000Z",
      newest: "2026-11-01T10:06:00.000Z",
      recording: true,
      recordsValues: false,
      activityLog: { retentionDays: null },
      tests: [
        { id: "t1", label: "P01", startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T10:05:00.000Z" },
      ],
    });
    const test = await request(createApp()).get("/api/activity").query({ test: "t1" });
    expect(test.body.events.map((e: { id: string }) => e.id)).toEqual(["start", "click", "end"]);
  });

  it("drops events older than the retention period", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00.000Z"));
    await turnOn();
    await record([event("old", "2026-11-01T10:00:00.000Z"), event("new", "2026-11-09T10:00:00.000Z")]);
    const saved = await request(createApp())
      .put("/api/activity/settings")
      .send({ activityLog: { retentionDays: 7 } });
    expect(saved.body).toEqual({ activityLog: { retentionDays: 7 } });
    const events = (await request(createApp()).get("/api/activity")).body.events;
    expect(events.map((e: { id: string }) => e.id)).toEqual(["new"]);
  });

  it("says whether values are recorded, as the installation sets it", async () => {
    vi.stubEnv("NWAVE_VERBOSE_VALUES", "on");
    expect((await request(createApp()).get("/api/activity/summary")).body.recordsValues).toBe(true);
  });

  it("clears the log", async () => {
    await turnOn();
    await record([event("a", "2026-11-01T10:00:00.000Z")]);
    expect((await request(createApp()).delete("/api/activity")).body).toEqual({ cleared: true });
    expect((await request(createApp()).get("/api/activity/summary")).body.events).toBe(0);
  });
});

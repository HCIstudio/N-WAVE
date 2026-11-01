import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "../activity/activityEvents";
import demoApi from "./demoApi";
import { DEMO_ACTIVITY_KEY } from "./demoActivity";

const event = (id: string, time: string, test?: string): ActivityEvent => ({
  id,
  time,
  type: test ? "test.started" : "ui.click",
  ...(test ? { test, data: { label: "P01" } } : {}),
});

const turnOn = (on: boolean) => localStorage.setItem("nwave-demo-features", JSON.stringify({ verbose: on }));

describe("demo activity log", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("keeps nothing while verbose mode is off", async () => {
    turnOn(false);
    expect((await demoApi.post("/activity", { events: [event("a", "2026-11-01T10:00:00.000Z")] })).data).toEqual({
      recorded: 0,
    });
    expect(localStorage.getItem(DEMO_ACTIVITY_KEY)).toBeNull();
  });

  it("keeps events in this browser and reads them back like the backend", async () => {
    turnOn(true);
    await demoApi.post("/activity", {
      events: [event("a", "2026-11-01T10:00:00.000Z"), event("b", "2026-11-01T11:00:00.000Z", "t1")],
    });
    const all = await demoApi.get<{ events: ActivityEvent[] }>("/activity");
    expect(all.data.events.map((e) => e.id)).toEqual(["a", "b"]);
    const test = await demoApi.get<{ events: ActivityEvent[] }>("/activity?test=t1");
    expect(test.data.events.map((e) => e.id)).toEqual(["b"]);
    const summary = await demoApi.get<{ events: number; tests: unknown[]; recording: boolean }>("/activity/summary");
    expect(summary.data).toMatchObject({ events: 2, recording: true, tests: [{ id: "t1", label: "P01" }] });
  });

  it("drops events older than the retention period, and clears", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00.000Z"));
    turnOn(true);
    await demoApi.post("/activity", {
      events: [event("old", "2026-11-01T10:00:00.000Z"), event("new", "2026-11-09T10:00:00.000Z")],
    });
    await demoApi.put("/activity/settings", { activityLog: { retentionDays: 7 } });
    expect((await demoApi.get<{ events: ActivityEvent[] }>("/activity")).data.events.map((e) => e.id)).toEqual([
      "new",
    ]);
    await demoApi.delete("/activity");
    expect((await demoApi.get<{ events: number }>("/activity/summary")).data.events).toBe(0);
  });
});

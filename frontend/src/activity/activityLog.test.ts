import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../api", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
  isDemoMode: false,
}));

const log = await import("./activityLog");
const { startRecording, stopRecording, recorded } = await import("./activityTesting");
const { DEFAULT_FEATURES } = await import("../api/settings");

describe("activity log", () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    post.mockResolvedValue({ data: { recorded: 1 } });
    startRecording();
  });
  afterEach(() => {
    stopRecording();
    vi.useRealTimers();
  });

  it("records nothing while verbose mode is off", async () => {
    startRecording({ verbose: false });
    log.logActivity("ui.click", { element: "button", name: "Run" });
    log.startTest("P01");
    await log.flushActivity();
    expect(log.pendingActivity()).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it("starts each tab's record with the feature switches in effect", () => {
    log.logActivity("help.opened");
    log.logActivity("undo");
    const [first, ...rest] = log.pendingActivity();
    expect(first).toMatchObject({
      type: "session.started",
      data: { features: { ...DEFAULT_FEATURES, verbose: true }, recordsValues: false },
    });
    expect(rest.map((event) => event.type)).toEqual(["help.opened", "undo"]);
    expect(new Set(log.pendingActivity().map((event) => event.session)).size).toBe(1);
    expect(new Set(log.pendingActivity().map((event) => event.id)).size).toBe(3);
  });

  it("stamps each event with its time, page, workflow, participant and test", () => {
    log.setParticipant("P07");
    log.setActivityWorkflow("wf-1");
    const test = log.startTest("Task 1");
    log.logActivity("undo");
    const [started, undo] = recorded();
    expect(started).toMatchObject({ type: "test.started", test: test.id, data: { label: "Task 1" } });
    expect(undo).toMatchObject({ type: "undo", participant: "P07", test: test.id, workflowId: "wf-1", path: "/" });
    expect(Date.parse(undo.time)).not.toBeNaN();
  });

  it("brackets a marked test: events after End test carry no test", () => {
    const test = log.startTest();
    log.endTest();
    log.logActivity("redo");
    expect(recorded().map((event) => [event.type, event.test])).toEqual([
      ["test.started", test.id],
      ["test.ended", test.id],
      ["redo", undefined],
    ]);
    expect(log.getCurrentTest()).toBeNull();
  });

  it("ends a test that is still going when the next starts", () => {
    const first = log.startTest("A");
    const second = log.startTest("B");
    expect(recorded().map((event) => [event.type, event.test])).toEqual([
      ["test.started", first.id],
      ["test.ended", first.id],
      ["test.started", second.id],
    ]);
  });

  it("takes only codes as participant IDs, never names with spaces", () => {
    expect(log.setParticipant("Ada Lovelace")).toBe(false);
    expect(log.getParticipant()).toBe("");
    expect(log.setParticipant(" P-07_b ")).toBe(true);
    expect(log.getParticipant()).toBe("P-07_b");
    expect(log.setParticipant("")).toBe(true);
    expect(log.getParticipant()).toBe("");
  });

  it("sends events in batches, and keeps them when N-WAVE can't be reached", async () => {
    vi.useFakeTimers();
    log.logActivity("undo");
    expect(post).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/activity");
    expect((post.mock.calls[0][1] as { events: unknown[] }).events).toHaveLength(2);
    expect(log.pendingActivity()).toEqual([]);

    post.mockRejectedValueOnce(new Error("Network Error"));
    log.logActivity("redo");
    await log.flushActivity();
    expect(recorded().map((event) => event.type)).toEqual(["redo"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log.pendingActivity()).toEqual([]);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("sends at once when many events wait", () => {
    for (let index = 0; index < 50; index += 1) log.logActivity("undo");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("snapshots a workflow without values, unless the installation records them", () => {
    const nodes = [
      { id: "a", type: "process", position: { x: 10.4, y: 20.6 }, data: { label: "FastQC", parameters: [{ value: "secret" }] } },
    ];
    const edges = [{ id: "e", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }];
    expect(log.workflowSnapshot(nodes, edges, false)).toEqual({
      nodes: [{ id: "a", type: "process", label: "FastQC", position: { x: 10, y: 21 } }],
      edges: [{ id: "e", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }],
    });
    expect(log.workflowSnapshot(nodes, edges, true).nodes[0]).toMatchObject({ data: nodes[0].data });
  });
});

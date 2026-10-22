import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunTask } from "../../api/runs";
import { renderHook } from "../../test/renderHook";

const listRunTasks = vi.fn<(runId: string) => Promise<RunTask[]>>();
vi.mock("../../api/runs", () => ({
  listRunTasks: (runId: string) => listRunTasks(runId),
}));

const { RUN_TASKS_POLL_MS, useRunTasks } = await import("./useRunTasks");

describe("useRunTasks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listRunTasks.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("waits for a slow answer before asking again", async () => {
    let answer: (tasks: RunTask[]) => void = () => undefined;
    listRunTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const hook = renderHook(() => useRunTasks("bee_1", true, []));
    await act(async () => vi.advanceTimersByTime(RUN_TASKS_POLL_MS * 5));
    expect(listRunTasks).toHaveBeenCalledTimes(1);

    await act(async () => answer([]));
    await act(async () => vi.advanceTimersByTime(RUN_TASKS_POLL_MS));
    expect(listRunTasks).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
});

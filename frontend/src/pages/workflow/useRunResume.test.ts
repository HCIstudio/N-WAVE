import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getWorkflowCache: vi.fn(),
  clearWorkflowCache: vi.fn(),
  listRuns: vi.fn(),
}));
vi.mock("../../api/runs", () => api);

const { resumesAfter, useRunResume } = await import("./useRunResume");

describe("useRunResume", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getWorkflowCache.mockResolvedValue({ bytes: 100, folders: 1 });
  });

  it("resumes by default after a failed or cancelled run", () => {
    expect(["failed", "cancelled", "succeeded", undefined].map(resumesAfter)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("turns Resume on after a failed run, and off once the cache is cleared", async () => {
    api.listRuns.mockResolvedValue([{ id: "r1", status: "failed" }]);
    api.clearWorkflowCache.mockResolvedValue({ bytes: 0, folders: 0 });
    const { result } = renderHook(() =>
      useRunResume({ workflowId: "wf1", enabled: true, isRunning: false }),
    );
    await waitFor(() => expect(result.current.resume).toBe(true));
    expect(result.current.available).toBe(true);
    act(() => result.current.setResume(false));
    expect(result.current.resume).toBe(false);

    await act(() => result.current.clear());
    expect(api.clearWorkflowCache).toHaveBeenCalledWith("wf1");
    expect(result.current.available).toBe(false);
    expect(result.current.resume).toBe(false);
  });

  it("starts with Resume off after a successful run", async () => {
    api.listRuns.mockResolvedValue([{ id: "r1", status: "succeeded" }]);
    const { result } = renderHook(() =>
      useRunResume({ workflowId: "wf1", enabled: true, isRunning: false }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.resume).toBe(false);
  });

  it("offers nothing in the demo, for unsaved workflows or an older backend", async () => {
    const demo = renderHook(() => useRunResume({ workflowId: "wf1", enabled: false, isRunning: false }));
    const unsaved = renderHook(() =>
      useRunResume({ workflowId: undefined, enabled: true, isRunning: false }),
    );
    api.getWorkflowCache.mockRejectedValue(new Error("404"));
    api.listRuns.mockResolvedValue([]);
    const old = renderHook(() => useRunResume({ workflowId: "wf2", enabled: true, isRunning: false }));
    await waitFor(() => expect(api.getWorkflowCache).toHaveBeenCalledWith("wf2"));
    for (const { result } of [demo, unsaved, old]) {
      expect(result.current.available).toBe(false);
      expect(result.current.cache).toBeNull();
    }
  });

  it("reports a cache that can't be cleared", async () => {
    api.listRuns.mockResolvedValue([]);
    api.clearWorkflowCache.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "A run of this workflow is still going" } },
    });
    const { result } = renderHook(() =>
      useRunResume({ workflowId: "wf1", enabled: true, isRunning: false }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() => result.current.clear());
    expect(result.current.error).toContain("still going");
  });
});

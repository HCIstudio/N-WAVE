import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flush, renderHook } from "../test/renderHook";

const get = vi.fn();
const put = vi.fn();
vi.mock("../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
  },
  isDemoMode: false,
}));

const { currentFeatures, resetFeatures, useFeature, useFeatures, useWorkflowCheckMode } = await import(
  "./useFeatures"
);
const { DEFAULT_FEATURES } = await import("../api/settings");

describe("useFeatures", () => {
  beforeEach(() => {
    resetFeatures();
    get.mockReset();
    put.mockReset();
  });

  it("has every feature on until N-WAVE answers, then reads them once for all components", async () => {
    get.mockResolvedValue({
      data: { features: { performance: false, workflowCheck: "warn" }, lockedFeatures: ["performance"] },
    });
    const first = renderHook(() => useFeature("performance"));
    const second = renderHook(useWorkflowCheckMode);
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe("block");
    await flush();
    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe("warn");
    expect(get).toHaveBeenCalledTimes(1);
    expect(currentFeatures()).toEqual({ ...DEFAULT_FEATURES, performance: false, workflowCheck: "warn" });
    first.unmount();
    second.unmount();
  });

  it("treats an older backend without feature switches as everything on", async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    const { result, unmount } = renderHook(useFeatures);
    await flush();
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.features).toEqual(DEFAULT_FEATURES);
    unmount();
  });

  it("reads them again when the tab comes back into view", async () => {
    get.mockResolvedValue({ data: { features: {}, lockedFeatures: [] } });
    const { result, unmount } = renderHook(() => useFeature("glossary"));
    await flush();
    get.mockResolvedValue({ data: { features: { glossary: false }, lockedFeatures: [] } });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(result.current).toBe(false);
    unmount();
  });

  it("saves the switches and shares what N-WAVE kept", async () => {
    get.mockResolvedValue({ data: { features: {}, lockedFeatures: [] } });
    put.mockResolvedValue({
      data: { features: { ...DEFAULT_FEATURES, templates: false }, lockedFeatures: ["resume"] },
    });
    const settings = renderHook(useFeatures);
    const templates = renderHook(() => useFeature("templates"));
    await flush();
    await act(async () => {
      await settings.result.current.save({ ...DEFAULT_FEATURES, templates: false });
    });
    expect(put).toHaveBeenCalledWith("/settings/features", { features: { ...DEFAULT_FEATURES, templates: false } });
    expect(templates.result.current).toBe(false);
    expect(settings.result.current.locked).toEqual(["resume"]);
    settings.unmount();
    templates.unmount();
  });
});

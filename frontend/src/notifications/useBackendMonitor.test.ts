import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../api", () => ({ default: { get: (...args: unknown[]) => get(...args) }, isDemoMode: false }));
const notify = vi.fn(() => true);
vi.mock("./notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./notifications")>()),
  notify: (...args: unknown[]) => notify(...(args as [])),
}));

const { DEFAULT_NOTIFICATION_PREFS, writeNotificationPrefs } = await import("./notifications");
const { HEALTH_INTERVAL_MS, useBackendMonitor } = await import("./useBackendMonitor");

const tick = () => act(async () => {
  await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS);
});

describe("useBackendMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get.mockReset();
    notify.mockClear();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("asks nothing while the notification is off", async () => {
    renderHook(() => useBackendMonitor());
    await tick();
    expect(get).not.toHaveBeenCalled();
  });

  it("notifies once N-WAVE stopped answering, and when it's back", async () => {
    writeNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
    get.mockResolvedValue({ data: { ok: true } });
    renderHook(() => useBackendMonitor());
    await tick();
    expect(get).toHaveBeenCalledWith("/health", { timeout: 10_000 });

    get.mockRejectedValue(new Error("Network Error"));
    // One failed check is a blip (a restart).
    await tick();
    expect(notify).not.toHaveBeenCalled();
    await tick();
    expect(notify).toHaveBeenCalledWith("backendLost", expect.objectContaining({ title: "N-WAVE can't be reached" }));
    await tick();
    expect(notify).toHaveBeenCalledTimes(1);

    get.mockResolvedValue({ data: { ok: true } });
    await tick();
    expect(notify).toHaveBeenLastCalledWith("backendLost", expect.objectContaining({ title: "N-WAVE is back" }));
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFS,
  notificationSupport,
  notify,
  readNotificationPrefs,
  requestNotificationPermission,
  sendTestNotification,
  setNotificationNavigator,
  writeNotificationPrefs,
} from "./notifications";
import { resetFeatures } from "../settings/useFeatures";

const shown: Array<{ title: string; options: NotificationOptions; close: () => void; onclick?: () => void }> = [];

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(title: string, options: NotificationOptions) {
    const entry = { title, options, close: this.close } as (typeof shown)[number];
    shown.push(entry);
    // The test reads the handler after it was set.
    queueMicrotask(() => {
      entry.onclick = this.onclick ?? undefined;
    });
  }
}

const setView = (visible: boolean, focused = visible) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visible ? "visible" : "hidden" });
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
};

const content = { title: "rnaseq finished", body: "Done", tag: "run-1", path: "/workflow/wf?run=1" };

describe("notifications", () => {
  beforeEach(() => {
    localStorage.clear();
    shown.length = 0;
    FakeNotification.permission = "granted";
    vi.stubGlobal("Notification", FakeNotification);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    writeNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true });
    setView(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setNotificationNavigator(null);
  });

  it("keeps the choices in this browser, off until turned on", () => {
    localStorage.clear();
    expect(readNotificationPrefs()).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(readNotificationPrefs().enabled).toBe(false);
    writeNotificationPrefs({ enabled: true, events: { runSucceeded: false, runFailed: true, backendLost: true } });
    expect(readNotificationPrefs().events.runSucceeded).toBe(false);
  });

  it("notifies while the tab isn't in view, and opens the run on a click", async () => {
    const navigate = vi.fn();
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    setNotificationNavigator(navigate);
    expect(notify("runSucceeded", content)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("rnaseq finished");
    expect(shown[0].options).toMatchObject({ body: "Done", tag: "run-1" });
    await Promise.resolve();
    shown[0].onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/workflow/wf?run=1");
  });

  it("doesn't notify while the tab is in view, or for events turned off", () => {
    setView(true);
    expect(notify("runSucceeded", content)).toBe(false);
    // Visible but another window has the focus: notify.
    setView(true, false);
    expect(notify("runSucceeded", { ...content, tag: "run-2" })).toBe(true);
    setView(false);
    writeNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, enabled: true, events: { ...DEFAULT_NOTIFICATION_PREFS.events, runFailed: false } });
    expect(notify("runFailed", { ...content, tag: "run-3" })).toBe(false);
    writeNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
    expect(notify("runSucceeded", { ...content, tag: "run-4" })).toBe(false);
    expect(shown).toHaveLength(1);
  });

  it("sends the same notification once, however many tabs notice it", () => {
    expect(notify("runSucceeded", content)).toBe(true);
    // Another tab shares the storage: it finds the mark and stays quiet.
    expect(notify("runSucceeded", content)).toBe(false);
    expect(shown).toHaveLength(1);
  });

  it("needs permission and a secure page", async () => {
    FakeNotification.permission = "denied";
    expect(notify("runSucceeded", content)).toBe(false);
    expect(notificationSupport()).toBe("denied");

    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockResolvedValueOnce("granted");
    expect(await requestNotificationPermission()).toBe("granted");

    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    expect(notificationSupport()).toBe("insecure");
  });

  it("sends a test notification even while the tab is in view", () => {
    setView(true);
    expect(sendTestNotification()).toBe(true);
    expect(shown[0].title).toBe("N-WAVE notifications work");
  });

  it("sends nothing while notifications are switched off for this N-WAVE", () => {
    resetFeatures({ notifications: false });
    try {
      expect(notify("runSucceeded", content)).toBe(false);
      expect(shown).toHaveLength(0);
    } finally {
      resetFeatures();
    }
  });
});

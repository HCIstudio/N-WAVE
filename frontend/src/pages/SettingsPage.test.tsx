import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
  },
  isDemoMode: false,
}));

vi.mock("../utils/buildInfo", () => ({
  buildInfo: { version: "1.4.0", displayBuildDate: "2026-10-28" },
}));

const { default: SettingsPage } = await import("./SettingsPage");
const { resetRunDefaults } = await import("../settings/useRunDefaults");
const { resetFeatures } = await import("../settings/useFeatures");

const runDefaults = {
  maxCpus: 4,
  maxMemory: "4.GB",
  timeoutMinutes: 0,
  resume: "after-failure",
  runProfiles: [],
};

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
  constructor(public title: string) {
    shown.push(title);
  }
}
const shown: string[] = [];

const setup = () => {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
};

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRunDefaults();
    shown.length = 0;
    FakeNotification.permission = "default";
    vi.stubGlobal("Notification", FakeNotification);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    get.mockImplementation(async (url: string) => {
      if (url === "/settings") return { data: { runDefaults } };
      if (url === "/execute/limits") return { data: { maxCpus: 16, maxMemory: "64.GB", defaultTimeoutMinutes: 1440 } };
      if (url === "/execute/caches") return { data: { bytes: 2048, folders: 3 } };
      throw new Error(`Unexpected ${url}`);
    });
    put.mockImplementation(async (_url: string, body: { runDefaults: unknown }) => ({ data: body }));
    del.mockResolvedValue({ data: { bytes: 0, folders: 0, skipped: 1 } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for permission only when notifications are turned on, then sends a test", async () => {
    const user = setup();
    const toggle = screen.getByLabelText("Send browser notifications") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Send test notification" }) as HTMLButtonElement).disabled).toBe(true);
    // The events are greyed out while notifications are off.
    const events = screen.getByRole("group", { name: "Notify when" }) as HTMLFieldSetElement;
    expect(events.disabled).toBe(true);
    expect(events.className).toContain("opacity-50");

    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = "granted";
      return "granted";
    });
    await user.click(toggle);
    await waitFor(() => expect(toggle.checked).toBe(true));
    expect(events.className).not.toContain("opacity-50");
    expect(JSON.parse(localStorage.getItem("nwave-notifications") ?? "{}").enabled).toBe(true);

    await user.click(screen.getByLabelText("A run finished"));
    expect(JSON.parse(localStorage.getItem("nwave-notifications") ?? "{}").events.runSucceeded).toBe(false);

    await user.click(screen.getByRole("button", { name: "Send test notification" }));
    expect(shown).toEqual(["N-WAVE notifications work"]);
    expect(screen.getByRole("status").textContent).toContain("Sent.");
  });

  it("explains what to do when notifications are blocked or the page isn't secure", () => {
    FakeNotification.permission = "denied";
    const { unmount } = render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/blocks N-WAVE's notifications/)).toBeTruthy();
    expect((screen.getByLabelText("Send browser notifications") as HTMLInputElement).disabled).toBe(true);
    unmount();

    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    setup();
    expect(screen.getByText(/only show notifications for pages on HTTPS or on this computer/)).toBeTruthy();
  });

  it("edits and saves the run defaults, with the server's limits", async () => {
    const user = setup();
    expect(await screen.findByRole("note", { name: "Server limits" })).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save global settings" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Maximum CPU Cores"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Execution Timeout (minutes)"), { target: { value: "600" } });
    await user.selectOptions(screen.getByLabelText("Resume is on by Run"), "always");
    await user.click(screen.getByRole("button", { name: "SLURM cluster profile" }));
    await user.selectOptions(screen.getByLabelText("Runs use by default"), "slurm");
    expect(save.disabled).toBe(false);

    await user.click(save);
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/settings", {
        runDefaults: expect.objectContaining({
          maxCpus: 8,
          timeoutMinutes: 600,
          resume: "always",
          runProfile: "slurm",
          runProfiles: [expect.objectContaining({ name: "slurm", executor: "slurm" })],
        }),
      }),
    );
    expect(await screen.findByText(/^Saved\./)).toBeTruthy();
    expect(save.disabled).toBe(true);
  });

  it("shows and clears the cache of all workflows", async () => {
    const user = setup();
    const cache = screen.getByRole("region", { name: "Run cache" });
    expect(await within(cache).findByText("2.0 KB in 3 run folders")).toBeTruthy();
    await user.click(within(cache).getByRole("button", { name: "Clear all caches" }));
    await user.click(within(cache).getByRole("button", { name: "Clear all" }));
    expect(del).toHaveBeenCalledWith("/execute/caches");
    expect(await within(cache).findByText(/except 1 run folder a run still uses/)).toBeTruthy();
  });

  it("has a Features section, and hides the settings of features that are switched off", async () => {
    resetFeatures({ notifications: false, resume: false, runProfiles: false, glossary: false });
    try {
      setup();
      expect(screen.getByRole("region", { name: "Features" })).toBeTruthy();
      expect(await screen.findByLabelText("Maximum CPU Cores")).toBeTruthy();
      expect(screen.queryByLabelText("Send browser notifications")).toBeNull();
      expect(screen.queryByLabelText("Resume is on by Run")).toBeNull();
      expect(screen.queryByRole("region", { name: "Run profiles" })).toBeNull();
      const about = screen.getByRole("region", { name: "About" });
      expect(within(about).queryByRole("link", { name: "Help" })).toBeNull();
    } finally {
      resetFeatures();
    }
  });
});

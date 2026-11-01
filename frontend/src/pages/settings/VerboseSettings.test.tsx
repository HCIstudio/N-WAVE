import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
  },
  isDemoMode: false,
}));
const downloadBlob = vi.fn();
vi.mock("../workflow/workflowExport", () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

const { default: VerboseSettings } = await import("./VerboseSettings");
const { resetFeatures } = await import("../../settings/useFeatures");
const { getParticipant, resetActivityLog } = await import("../../activity/activityLog");
const { DEFAULT_FEATURES } = await import("../../api/settings");

const testEvents = [
  { id: "a", time: "2026-11-01T10:00:00.000Z", type: "test.started", test: "t1", data: { label: "P01" } },
  { id: "b", time: "2026-11-01T10:02:00.000Z", type: "undo", test: "t1" },
];

const summary = {
  events: 5,
  bytes: 2048,
  oldest: "2026-11-01T09:00:00.000Z",
  newest: "2026-11-01T10:06:00.000Z",
  tests: [{ id: "t1", label: "P01", startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T10:05:00.000Z" }],
  recording: true,
  recordsValues: false,
  activityLog: { retentionDays: null },
};

describe("VerboseSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetActivityLog();
    resetFeatures({ verbose: true });
    for (const mock of [get, put, post, del, downloadBlob]) mock.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url === "/activity/summary") return { data: summary };
      if (url.startsWith("/activity")) return { data: { events: testEvents } };
      throw new Error(`Unexpected ${url}`);
    });
    put.mockImplementation(async (url: string, body: { features?: unknown }) =>
      url === "/settings/features" ? { data: { features: body.features, lockedFeatures: [] } } : { data: body },
    );
    post.mockResolvedValue({ data: { recorded: 1 } });
    del.mockResolvedValue({ data: { cleared: true } });
  });
  afterEach(() => resetFeatures());

  it("switches verbose mode for everyone, unless the installation fixes it", async () => {
    resetFeatures({ verbose: false });
    const user = userEvent.setup();
    const { unmount } = render(<VerboseSettings />);
    await user.click(screen.getByRole("checkbox", { name: /Record what happens/ }));
    expect(put).toHaveBeenCalledWith("/settings/features", { features: { ...DEFAULT_FEATURES, verbose: true } });
    unmount();

    resetFeatures({ verbose: true }, ["verbose"]);
    render(<VerboseSettings />);
    expect((screen.getByRole("checkbox", { name: /Record what happens/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Fixed by this installation")).toBeTruthy();
  });

  it("takes a participant code for this browser, never a name", async () => {
    const user = userEvent.setup();
    render(<VerboseSettings />);
    const field = screen.getByLabelText("Participant ID (this browser)");
    await user.type(field, "Ada L");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Only letters, digits/)).toBeTruthy();
    await user.tab();
    expect(getParticipant()).toBe("");

    await user.clear(field);
    await user.type(field, "P07{Enter}");
    expect(getParticipant()).toBe("P07");
  });

  it("shows what is recorded and keeps events for the chosen time", async () => {
    const user = userEvent.setup();
    render(<VerboseSettings />);
    expect((await screen.findByTestId("activity-summary")).textContent).toMatch(/^5 events \(2\.0 KB\), from /);
    expect(screen.getByText(/File contents and parameter values are\s+not recorded/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Keep events for"), "30");
    expect(put).toHaveBeenCalledWith("/activity/settings", { activityLog: { retentionDays: 30 } });
  });

  it("exports one marked test on its own as a ZIP", async () => {
    const user = userEvent.setup();
    render(<VerboseSettings />);
    await screen.findByRole("option", { name: /P01/ });
    await user.selectOptions(screen.getByLabelText("Test to export"), "t1");
    await user.click(screen.getByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(get).toHaveBeenCalledWith("/activity?test=t1");
    const [blob, name] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("nwave-activity-test-P01.zip");
    expect(blob.type).toBe("application/zip");
    expect(screen.getByRole("status").textContent).toBe("Exported 2 events.");
  });

  it("copies the last minutes for a bug report", async () => {
    const user = userEvent.setup();
    // After setup, which puts in its own clipboard.
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<VerboseSettings />);
    await user.click(screen.getByRole("button", { name: "Copy for bug report" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/^\/activity\?from=/));
    expect(writeText.mock.calls[0][0]).toContain("N-WAVE activity, last 10 minutes");
  });

  it("clears the log after asking", async () => {
    const user = userEvent.setup();
    render(<VerboseSettings />);
    await screen.findByText(/^5 events/);
    await user.click(screen.getByRole("button", { name: "Clear log…" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear log" }));
    expect(del).toHaveBeenCalledWith("/activity");
    expect(await screen.findByText("Cleared.")).toBeTruthy();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getIoMonitorStatus = vi.fn();
vi.mock("../../api/runs", () => ({ getIoMonitorStatus: () => getIoMonitorStatus() }));
const saveFeatures = vi.fn();
vi.mock("../../api/settings", async (original) => ({
  ...(await original<typeof import("../../api/settings")>()),
  saveFeatures: (features: unknown) => saveFeatures(features),
}));

const { default: IoMonitorSettings } = await import("./IoMonitorSettings");
const { IO_MONITOR_SWITCH } = await import("../../settings/ioMonitorSwitch");
const { betaReportUrl } = await import("../../components/common/ui/BetaBadge");
const { resetFeatures } = await import("../../settings/useFeatures");

describe("IoMonitorSettings", () => {
  beforeEach(() => {
    getIoMonitorStatus.mockReset();
    resetFeatures({}, []);
    saveFeatures.mockImplementation(async (features: unknown) => ({ features, locked: [] }));
  });

  it("is off by default, names the privileges and the paper, and switches on", async () => {
    getIoMonitorStatus.mockResolvedValue({ available: true, image: "nwave-iomonitor:dev", imagePresent: true, kernel: "6.18.58", system: "Docker Desktop" });
    render(<IoMonitorSettings />);
    const box = screen.getByRole("checkbox", { name: /Monitor file accesses during runs/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/privileged/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "arXiv:2408.00411" }).getAttribute("href")).toBe(
      "https://arxiv.org/abs/2408.00411",
    );
    // The line says "Checking…" until the answer is there.
    await waitFor(() =>
      expect(screen.getByTestId("io-monitor-status").textContent).toContain("It can run here: Docker on Docker Desktop, kernel 6.18.58"),
    );
    await userEvent.click(box);
    expect(saveFeatures).toHaveBeenCalledWith(expect.objectContaining({ ioMonitor: true }));
  });

  it("is a beta feature: says what is under test and links to the test report form", async () => {
    getIoMonitorStatus.mockResolvedValue({ available: true, image: "nwave-iomonitor:dev", imagePresent: true });
    render(<IoMonitorSettings />);
    expect(IO_MONITOR_SWITCH.beta).toBeTruthy();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain(
      "Under test: on Docker Desktop and WSL 2 the monitor sees the whole machine and can miss file accesses.",
    );
    expect(screen.getByRole("link", { name: "Report how it works on yours" }).getAttribute("href")).toBe(
      betaReportUrl("I/O monitor"),
    );
    expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId("io-monitor-status").textContent).toContain("It can run here"));
  });

  it("downloads its image when switched on, and says so until it is here", async () => {
    const image = "hcistudio/nwave-iomonitor:1.7.0";
    const base = { available: true, image, kernel: "6.18.58", system: "Docker Desktop" };
    getIoMonitorStatus
      .mockResolvedValueOnce({ ...base, imagePresent: false, downloading: false })
      .mockResolvedValueOnce({ ...base, imagePresent: false, downloading: true })
      .mockResolvedValue({ ...base, imagePresent: true });
    render(<IoMonitorSettings />);
    const line = () => screen.getByTestId("io-monitor-status").textContent ?? "";
    await waitFor(() =>
      expect(line()).toContain(`Its image (${image}, about 100 MB) is downloaded once, when you switch it on.`),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await userEvent.click(screen.getByRole("checkbox", { name: /Monitor file accesses during runs/ }));
      await waitFor(() => expect(line()).toContain(`Downloading its image (${image}, about 100 MB). This happens once.`));
      await vi.advanceTimersByTimeAsync(3_000);
      await waitFor(() => expect(line()).not.toContain("image"));
      expect(line()).toContain("It can run here: Docker on Docker Desktop");
      // Here: nothing more to ask.
      const calls = getIoMonitorStatus.mock.calls.length;
      await vi.advanceTimersByTimeAsync(9_000);
      expect(getIoMonitorStatus.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says why it can't run here", async () => {
    getIoMonitorStatus.mockResolvedValue({ available: false, reason: "The monitor's image nwave-iomonitor:dev isn't on this computer.", image: "x", imagePresent: false });
    render(<IoMonitorSettings />);
    await waitFor(() =>
      expect(screen.getByTestId("io-monitor-status").textContent).toBe(
        "It can't run here: The monitor's image nwave-iomonitor:dev isn't on this computer.",
      ),
    );
  });
});

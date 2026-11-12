import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("../api", () => ({ default: { get: (...args: unknown[]) => get(...args) }, isDemoMode: false }));

const { useAnalysisProgress } = await import("./useAnalysisProgress");
const { default: AnalysisProgress } = await import("../components/canvas/AnalysisProgress");

const tools = (lint: boolean, bioflow: boolean) => ({
  data: {
    lint: { available: true, image: "nextflow/nextflow:25", imagePresent: lint },
    bioflow: { available: true, image: "hcistudio/nwave-bioflow:1", imagePresent: bioflow },
  },
});

const Probe = ({ running }: { running: boolean }) => {
  const progress = useAnalysisProgress(running);
  return progress ? <AnalysisProgress progress={progress} /> : <p>idle</p>;
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("useAnalysisProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    get.mockReset();
  });

  it("shows the download while the tools aren't here, then the reading, and the time it takes", async () => {
    get.mockResolvedValueOnce(tools(true, false)).mockResolvedValueOnce(tools(true, true));
    render(<Probe running />);
    await flush();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "Downloading the analysis tools (first time only)",
    );
    expect(screen.getByText("(1 left)")).toBeTruthy();
    expect(screen.getByText(/first analysis downloads the tools/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flush();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "nextflow lint and BioFlow-Insight read the code",
    );
    // The download stays in the list, done.
    expect(screen.getAllByLabelText("Done")).toHaveLength(2);
    expect(screen.getByText(/^3 s so far/)).toBeTruthy();
  });

  it("goes straight to reading when the tools are here, and is gone when the analysis ends", async () => {
    get.mockResolvedValue(tools(true, true));
    const { rerender } = render(<Probe running />);
    await flush();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "nextflow lint and BioFlow-Insight read the code",
    );
    expect(screen.queryByText(/Downloading/)).toBeNull();
    rerender(<Probe running={false} />);
    expect(screen.getByText("idle")).toBeTruthy();
  });
});

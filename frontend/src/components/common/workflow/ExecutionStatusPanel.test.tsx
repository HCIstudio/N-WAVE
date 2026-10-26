import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../api/runs", () => ({
  listRuns: vi.fn(async () => []),
  getRunLog: vi.fn(async () => ""),
  listRunResults: vi.fn(async () => []),
  runResultUrl: () => "",
}));

const { default: ExecutionStatusPanel } = await import(
  "./ExecutionStatusPanel"
);
type Props = React.ComponentProps<typeof ExecutionStatusPanel>;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const idle: Props["status"] = {
  isRunning: false,
  totalNodes: 0,
  completedNodes: 0,
  failedNodes: 0,
  runningNodes: 0,
  nodeStatuses: [],
  overallProgress: 0,
};
const failed: Props["status"] = {
  ...idle,
  startTime: new Date("2026-10-15T10:00:00Z"),
  endTime: new Date("2026-10-15T10:01:00Z"),
  totalNodes: 1,
  failedNodes: 1,
  currentStage: "Workflow failed",
};

describe("ExecutionStatusPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Partial<Props>) =>
    act(() =>
      root.render(
        <ExecutionStatusPanel status={idle} nodes={[]} isVisible {...props} />,
      ),
    );

  it("is titled Runs before any run", () => {
    render({});
    expect(container.querySelector("h3")?.textContent).toBe("Runs");
    expect(container.textContent).toContain("No run yet in this session");
  });

  it("shows a failed run's output on the Log tab", () => {
    render({
      status: failed,
      tab: "log",
      output: "N-WAVE run: x\nERROR ~ boom",
    });
    expect(container.querySelector("h3")?.textContent).toBe("Workflow Failed");
    const log = container.querySelector('[aria-label="Run log"]');
    expect(log?.textContent).toContain("ERROR ~ boom");
  });

  it("explains a failed run above its steps and its log", () => {
    const failure = {
  kind: "command-not-found" as const,
  title: "A program the step needs isn't installed",
  explanation: "The step runs “fastqc”, which isn't installed where it ran (exit status 127).",
  fix: "Turn on Docker in the execution settings.",
  docs: "https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#command-not-found",
  process: "NFCORE_FASTQC_QC",
};
    for (const tab of ["steps", "log"] as const) {
      render({ status: failed, tab, output: "ERROR ~ boom", failure, failedStepLabel: "FastQC" });
      const card = container.querySelector('[aria-label="Why the run failed"]');
      expect(card?.textContent).toContain("A program the step needs isn't installed");
      expect(card?.textContent).toContain("In “FastQC”");
    }
    render({ status: { ...failed, isRunning: true }, tab: "log", output: "", failure });
    expect(container.querySelector('[aria-label="Why the run failed"]')).toBeNull();
  });

  it("tells which steps were reused from the cache", () => {
    render({
      status: { ...idle, startTime: new Date("2026-10-15T10:00:00Z"), endTime: new Date() },
      steps: [
        { id: "a", label: "FastQC", status: "cached", done: 2, total: 2, cached: 2 },
        { id: "b", label: "Trim", status: "succeeded", done: 2, total: 2, cached: 1 },
        { id: "c", label: "MultiQC", status: "succeeded", done: 1, total: 1 },
      ],
    });
    expect(container.textContent).toContain("1 step was reused from the cache of the last run");
    const steps = container.querySelector('[aria-label="Steps of this run"]')?.textContent ?? "";
    expect(steps).toContain("FastQCreused from cache");
    expect(steps).toContain("Trim2 of 2, 1 reused");
    expect(steps).toContain("MultiQC1 of 1");
  });

    it("switches tabs and maximizes", () => {
    const onTabChange = vi.fn();
    render({ status: failed, onTabChange });
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Steps",
      "Log",
      "History",
    ]);
    act(() => (tabs[2] as HTMLButtonElement).click());
    expect(onTabChange).toHaveBeenCalledWith("history");

    const panel = container.querySelector('[aria-label="Run panel"]');
    expect(panel?.className).not.toContain("top-4");
    act(() =>
      (
        container.querySelector(
          '[aria-label="Maximize panel"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(panel?.className).toContain("top-4");
  });

  it("can only be minimized while a run goes, and closed after", () => {
    const running = { ...idle, isRunning: true, startTime: new Date() };
    const onMinimizedChange = vi.fn();
    const onClose = vi.fn();
    render({ status: running, onClose, onMinimizedChange });
    expect(container.querySelector("h3")?.textContent).toBe("Workflow Running");
    expect(container.querySelector('[aria-label="Close run panel"]')).toBeNull();
    act(() =>
      (
        container.querySelector(
          '[aria-label="Minimize run panel"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(onMinimizedChange).toHaveBeenCalledWith(true);

    render({
      status: running,
      onClose,
      onMinimizedChange,
      minimized: true,
      steps: [
        { id: "a", label: "Filter", status: "succeeded", done: 1, total: 1 },
        { id: "b", label: "Merge", status: "running", done: 0, total: 1, running: 1 },
      ],
    });
    expect(container.textContent).toContain("1 task done, 1 running");
    expect(container.querySelector('[aria-label="Close run panel"]')).toBeNull();
    act(() =>
      (
        container.querySelector(
          '[aria-label="Expand run panel"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(onMinimizedChange).toHaveBeenCalledWith(false);

    render({ status: failed, onClose, onMinimizedChange });
    expect(container.querySelector('[aria-label="Close run panel"]')).not.toBeNull();
  });

  it("shows progress without a share of a total that keeps growing", () => {
    const running: Props["status"] = {
      ...idle,
      isRunning: true,
      startTime: new Date(),
      currentStage: "Running",
    };
    render({
      status: { ...running, overallProgress: 63 },
      runId: "run-1",
      minimized: false,
      steps: [
        {
          id: "pipeline",
          label: "nf-core Pipeline",
          status: "running",
          done: 32,
          total: 34,
          running: 2,
          substeps: [
            {
              id: "NFCORE_ATACSEQ:ATACSEQ:FASTQC",
              label: "FASTQC",
              status: "succeeded",
              done: 30,
              total: 30,
            },
            {
              id: "NFCORE_ATACSEQ:ATACSEQ:MACS2",
              label: "MACS2",
              status: "running",
              done: 2,
              total: 4,
              running: 2,
            },
          ],
        },
      ],
    });
    expect(container.textContent).not.toContain("63%");
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBeNull();
    expect(bar?.getAttribute("aria-valuetext")).toBe("32 tasks done, 2 running");
    expect(container.textContent).toContain("Still running…");

    // A pipeline's processes show under it.
    const substeps = container.querySelector(
      '[aria-label="Steps of nf-core Pipeline"]',
    );
    expect(substeps?.textContent).toContain("FASTQC30 of 30");
    expect(substeps?.textContent).toContain("MACS22 of 4");

    render({
      status: { ...running, isRunning: false, endTime: new Date(), currentStage: "Nextflow execution completed successfully" },
      runId: "run-1",
      minimized: false,
    });
    expect(container.textContent).toContain("Done");
    const doneBar = container.querySelector('[role="progressbar"]');
    expect(doneBar?.getAttribute("aria-valuenow")).toBe(
      doneBar?.getAttribute("aria-valuemax"),
    );

    // Once Nextflow has said how many processes there are, they are counted.
    render({
      status: { ...running, totalProcesses: 40, finishedProcesses: 10 },
      runId: "run-1",
      minimized: false,
    });
    const stepsBar = container.querySelector('[role="progressbar"]');
    expect(stepsBar?.getAttribute("aria-valuenow")).toBe("10");
    expect(stepsBar?.getAttribute("aria-valuemax")).toBe("40");
    expect(container.textContent).toContain("10 of 40 steps finished");
    expect(container.textContent).not.toContain("%");
  });

  it("renders nothing when hidden", () => {
    render({ isVisible: false });
    expect(container.innerHTML).toBe("");
  });
});

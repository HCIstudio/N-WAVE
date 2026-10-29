import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TraceTask } from "../../../api/runs";

const listRunReports = vi.fn();
const getRunTrace = vi.fn();
const listRunTasks = vi.fn();
vi.mock("../../../api/runs", () => ({
  listRunReports: (id: string) => listRunReports(id),
  getRunTrace: (id: string) => getRunTrace(id),
  listRunTasks: (id: string) => listRunTasks(id),
  runReportUrl: (id: string, kind: string) => `/api/execute/runs/${id}/reports/${kind}`,
}));

const { default: RunPerformance } = await import("./RunPerformance");

const GB = 1024 ** 3;
const task = (process: string, extra: Partial<TraceTask> = {}): TraceTask => ({
  hash: "aa/000000",
  name: `${process} (1)`,
  process,
  status: "COMPLETED",
  exit: 0,
  attempt: 1,
  submit: 0,
  start: 0,
  complete: 60_000,
  duration: 60_000,
  realtime: 60_000,
  cpu: 100,
  peakRss: GB,
  cpus: 1,
  memory: 4 * GB,
  ...extra,
});

describe("RunPerformance", () => {
  beforeEach(() => {
    listRunReports.mockResolvedValue({ report: true, timeline: true, trace: true });
    listRunTasks.mockResolvedValue([{ hash: "85/280734", status: "ignored" }]);
    getRunTrace.mockResolvedValue([
      task("MAG:FASTQC"),
      task("MAG:SPADES", { start: 60_000, complete: 3_660_000, realtime: 3_600_000, peakRss: 7.8 * GB, memory: 8 * GB }),
      task("MAG:MAXBIN2", { status: "FAILED", exit: 255, hash: "85/280734" }),
      task("MAG:FASTQC", { status: "CACHED" }),
    ]);
  });

  it("links the execution report and timeline, and sums up the steps, slowest first", async () => {
    render(<RunPerformance runId="mag_1" />);
    expect(
      (await screen.findByRole("link", { name: "Execution report" })).getAttribute("href"),
    ).toBe("/api/execute/runs/mag_1/reports/report");
    expect(screen.getByRole("link", { name: "Timeline" }).getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("run-performance-summary").textContent).toBe(
      "Took 1 h 1 min · 1.03 CPU hours · 4 tasks: 1 cached, 1 failed but ignored",
    );
    const rows = within(screen.getByRole("table", { name: "Steps by time" })).getAllByRole(
      "row",
    ) as HTMLTableRowElement[];
    expect(rows.slice(1).map((row) => row.cells[0]?.textContent)).toEqual(["SPADES", "FASTQC", "MAXBIN2"]);
    expect(rows[1]?.textContent).toContain("7.8 GB of 8.0 GB");
    expect(within(screen.getByRole("list", { name: "Memory hints" })).getByText("SPADES")).toBeTruthy();
  });

  it("names steps as their nodes on the canvas, and says when tasks were too short to measure", async () => {
    getRunTrace.mockResolvedValue([
      task("filter_demo_filter_barry", { realtime: 120, peakRss: 0 }),
      task("NFCORE_X:FASTQC", { realtime: 1500 }),
    ]);
    render(
      <RunPerformance
        runId="bee_1"
        labelFor={(process) => (process === "filter_demo_filter_barry" ? "Filter" : undefined)}
      />,
    );
    const table = await screen.findByRole("table", { name: "Steps by time" });
    const rows = within(table).getAllByRole("row") as HTMLTableRowElement[];
    expect(rows.slice(1).map((row) => row.cells[0]?.textContent)).toEqual(["FASTQC", "Filter"]);
    expect(rows[2]?.cells[2]?.textContent).toBe("< 1 s");
    expect(rows[2]?.cells[4]?.textContent).toBe("– of 4.0 GB");
  });

  it("says when a run has no reports", async () => {
    listRunReports.mockRejectedValue(new Error("404"));
    render(<RunPerformance runId="old_1" />);
    expect(await screen.findByText(/has no execution report or trace/)).toBeTruthy();
  });

  it("shows the report links without a trace", async () => {
    listRunReports.mockResolvedValue({ report: true, timeline: false, trace: false });
    render(<RunPerformance runId="r1" />);
    expect(await screen.findByText("This run has no trace to sum up.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Execution report" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Timeline" })).toBeNull();
  });
});

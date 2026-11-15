import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RunAccesses, TaskFile } from "../../../api/runs";

const getRunAccesses = vi.fn();
vi.mock("../../../api/runs", () => ({ getRunAccesses: (id: string) => getRunAccesses(id) }));
const { default: NodeIoView } = await import("./NodeIoView");

const file = (path: string, extra: Partial<TaskFile>): TaskFile => ({
  path,
  inode: 1,
  bytesRead: 0,
  bytesWritten: 0,
  reads: 0,
  writes: 0,
  size: 0,
  firstAccess: 0,
  lastAccess: 0,
  firstRead: null,
  lastRead: null,
  firstWrite: null,
  lastWrite: null,
  deleted: false,
  samples: [],
  ...extra,
});

const recorded: RunAccesses = {
  status: "recorded",
  total: 100,
  unlinked: { outsideTasks: 0, unknownProcess: 0, unknownFile: 0, tasksWithoutStart: [] },
  tasks: [
    {
      hash: "aa/111111",
      name: "TRIM (s1)",
      process: "TRIM",
      cgroup: "1",
      pids: 3,
      start: 100,
      end: 110,
      files: [
        file("nextflow/work/aa/111111x/s1.fq", { bytesRead: 2048, reads: 20, firstRead: 0.5, lastRead: 9.5, firstAccess: 0, lastAccess: 9.5, samples: [[0.5, 0, 1024, "R"], [9.5, 1024, 1024, "R"]] }),
        file("nextflow/work/aa/111111x/s1.trim.fq", { bytesWritten: 1024, writes: 1, firstWrite: 9.8, lastWrite: 9.8, firstAccess: 9.8, lastAccess: 9.8, samples: [[9.8, 0, 1024, "W"]] }),
      ],
    },
    { hash: "bb/222222", name: "OTHER", process: "OTHER", cgroup: "2", pids: 1, start: 0, end: 1, files: [] },
  ],
};

describe("NodeIoView", () => {
  it("lists the step's files with sizes, when and how, credits the method, and follows a file", async () => {
    getRunAccesses.mockResolvedValue(recorded);
    render(<NodeIoView runId="r1" hashes={["aa/111111"]} />);
    const table = await screen.findByRole("table", { name: "Files of TRIM (s1)" });
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("s1.fq2.0 KB–");
    expect(rows[0]?.textContent).toContain("read streaming (90 % of the time)");
    expect(rows[1]?.textContent).toContain("written at once");
    expect(screen.getByRole("link", { name: "arXiv:2408.00411" }).getAttribute("href")).toBe("https://arxiv.org/abs/2408.00411");
    await userEvent.click(screen.getAllByRole("button", { name: "Follow" })[0] as HTMLElement);
    expect(screen.getByRole("img", { name: "Offsets of s1.fq read and written over time" })).toBeTruthy();
    // A beta feature: what is under test, and where to report.
    expect(screen.getByRole("note").textContent).toContain("Under test: on Docker Desktop and WSL 2 the monitor sees the whole machine");
    expect(screen.getByRole("link", { name: "Report how it works on yours" })).toBeTruthy();
    // A run from before the check of the work folders: no line about it.
    expect(screen.queryByTestId("io-view-work-folders")).toBeNull();
  });

  it("says how many of the step's work-folder files the monitor missed", async () => {
    getRunAccesses.mockResolvedValue({
      ...recorded,
      workFolders: [
        { folder: "aa/111111x", files: 9, missed: 2, missedFiles: [".command.begin", ".command.err"] },
        { folder: "bb/222222x", files: 9, missed: 0, missedFiles: [] },
      ],
    });
    render(<NodeIoView runId="r3" hashes={["aa/111111"]} />);
    expect((await screen.findByTestId("io-view-work-folders")).textContent).toBe(
      "The monitor saw 7 of the 9 files in this step's work folder; it missed 2 (.command.begin, .command.err), so these views lack their accesses.",
    );
  });

  it("says how to turn the monitor on when it was off for the run", async () => {
    getRunAccesses.mockResolvedValue({ status: "off" });
    render(<NodeIoView runId="r2" hashes={["aa/111111"]} />);
    expect((await screen.findByTestId("io-view-off")).textContent).toContain("Global Settings → I/O monitor");
  });
});

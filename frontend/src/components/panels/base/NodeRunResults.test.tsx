import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunTask } from "../../../api/runs";
import type { NodeRunSummary } from "../../../execution/nodeRuns";

const listTaskFiles = vi.fn();
const getTaskFileText = vi.fn();
vi.mock("../../../api/runs", () => ({
  listTaskFiles: (...args: unknown[]) => listTaskFiles(...args),
  getTaskFileText: (...args: unknown[]) => getTaskFileText(...args),
  taskFileUrl: (runId: string, hash: string, path: string) =>
    `/files/${runId}/${hash}/${path}`,
}));

const { RunTasksContext } = await import("../../../execution/RunTasksContext");
const { default: NodeRunResults, LastRunSection } = await import(
  "./NodeRunResults"
);

const task = (extra: Partial<RunTask> = {}): RunTask => ({
  hash: "ab/123456",
  name: "FASTQC (sample1)",
  process: "FASTQC",
  status: "succeeded",
  ...extra,
});

const summaryOf = (
  tasks: RunTask[],
  extra: Partial<NodeRunSummary> = {},
): NodeRunSummary => ({
  status: "succeeded",
  total: tasks.length,
  done: tasks.length,
  failed: 0,
  ignored: 0,
  running: 0,
  cached: 0,
  tasks,
  ...extra,
});

const renderWithRun = (
  ui: React.ReactElement,
  summary?: NodeRunSummary,
  runId: string | null = "run-1",
) =>
  render(
    <RunTasksContext.Provider
      value={{ runId, nodeRuns: summary ? { n1: summary } : {} }}
    >
      {ui}
    </RunTasksContext.Provider>,
  );

describe("NodeRunResults", () => {
  beforeEach(() => {
    listTaskFiles.mockReset();
    getTaskFileText.mockReset();
  });

  it("asks to run the workflow when there is no run", () => {
    renderWithRun(<NodeRunResults nodeId="n1" />);
    expect(screen.getByText(/Run the workflow to see/)).toBeTruthy();
  });

  it("lists the files of a task and previews the first text file", async () => {
    listTaskFiles.mockResolvedValue([
      { path: "manifest.json", size: 20 },
      { path: "report.html", size: 2048 },
      { path: "counts.csv", size: 3 * 1024 * 1024 },
      { path: "summary.txt", size: 500 },
    ]);
    getTaskFileText.mockResolvedValue("all good");
    renderWithRun(<NodeRunResults nodeId="n1" />, summaryOf([task()]));

    expect(screen.getByText("Last run: 1 of 1 task done.")).toBeTruthy();
    expect(screen.getByText("Loading files…")).toBeTruthy();
    const list = await screen.findByRole("list", {
      name: "Files of FASTQC (sample1)",
    });
    expect(list.textContent).toContain("20 B");
    expect(list.textContent).toContain("2.0 KB");
    expect(list.textContent).toContain("3.0 MB");
    expect(
      screen.getByRole("link", { name: "report.html" }).getAttribute("href"),
    ).toBe("/files/run-1/ab/123456/report.html");
    // The manifest is skipped in favour of a real text output.
    const preview = await screen.findByRole("document", {
      name: "Preview of summary.txt",
    });
    expect(preview.textContent).toBe("all good");
    expect(getTaskFileText).toHaveBeenCalledWith(
      "run-1",
      "ab/123456",
      "summary.txt",
    );
    // Only small text files can be previewed (not HTML, not the 3 MB CSV).
    expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(2);
  });

  it("previews another file on request", async () => {
    listTaskFiles.mockResolvedValue([
      { path: "a.txt", size: 1 },
      { path: "b.log", size: 1 },
    ]);
    getTaskFileText.mockImplementation(
      async (_run: string, _hash: string, path: string) => `text of ${path}`,
    );
    renderWithRun(<NodeRunResults nodeId="n1" />, summaryOf([task()]));
    await screen.findByRole("document", { name: "Preview of a.txt" });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Preview" })[1]);
    const preview = await screen.findByRole("document", {
      name: "Preview of b.log",
    });
    expect(preview.textContent).toBe("text of b.log");
  });

  it("summarises running and failed tasks", async () => {
    listTaskFiles.mockResolvedValue([]);
    renderWithRun(
      <NodeRunResults nodeId="n1" />,
      summaryOf(
        [
          task({ hash: "a", status: "running" }),
          task({ hash: "b", name: "BAD", status: "failed", exitCode: 137 }),
        ],
        { done: 0, running: 1, failed: 1 },
      ),
    );
    expect(
      screen.getByText("Last run: 0 of 2 tasks done, 1 running, 1 failed."),
    ).toBeTruthy();
    expect(screen.getByText("exit 137")).toBeTruthy();
    expect(
      await screen.findByText("No files yet: the step is still running."),
    ).toBeTruthy();
    expect(
      await screen.findByText("This step produced no files."),
    ).toBeTruthy();
  });

  it("tells which tasks failed but were ignored", async () => {
    listTaskFiles.mockResolvedValue([]);
    renderWithRun(
      <NodeRunResults nodeId="n1" />,
      summaryOf(
        [
          task({ hash: "a" }),
          task({ hash: "b", name: "MAXBIN2", status: "ignored", exitCode: 255 }),
        ],
        { ignored: 1 },
      ),
    );
    expect(
      screen.getByText(
        "Last run: 2 of 2 tasks done, 1 failed but ignored (the run went on without its results).",
      ),
    ).toBeTruthy();
    expect(screen.getByText("error ignored")).toBeTruthy();
    expect(screen.getByText("exit 255")).toBeTruthy();
    await screen.findAllByText("This step produced no files.");
  });

  it("shows why the files could not be listed", async () => {
    listTaskFiles.mockRejectedValue(new Error("Run not found"));
    renderWithRun(<NodeRunResults nodeId="n1" />, summaryOf([task()]));
    expect(await screen.findByText("Run not found")).toBeTruthy();
    expect(screen.queryByText("Loading files…")).toBeNull();
  });

  it("shows why a preview could not be loaded", async () => {
    listTaskFiles.mockResolvedValue([{ path: "a.txt", size: 1 }]);
    getTaskFileText.mockRejectedValue({});
    renderWithRun(<NodeRunResults nodeId="n1" />, summaryOf([task()]));
    expect(
      await screen.findByText("Could not load the file."),
    ).toBeTruthy();
  });

  it("does not preview while the task is running", async () => {
    listTaskFiles.mockResolvedValue([{ path: "a.txt", size: 1 }]);
    renderWithRun(
      <NodeRunResults nodeId="n1" />,
      summaryOf([task({ status: "running" })]),
    );
    await screen.findByRole("link", { name: "a.txt" });
    expect(getTaskFileText).not.toHaveBeenCalled();
  });
});

describe("LastRunSection", () => {
  it("is hidden when the node did not run", () => {
    const { container } = renderWithRun(<LastRunSection nodeId="n1" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the results under a heading", async () => {
    listTaskFiles.mockResolvedValue([]);
    renderWithRun(<LastRunSection nodeId="n1" />, summaryOf([task()]));
    expect(screen.getByText("Results of the last run")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText("This step produced no files."),
      ).toBeTruthy(),
    );
  });
});

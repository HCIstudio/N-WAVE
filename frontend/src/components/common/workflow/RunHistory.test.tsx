import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSummary } from "../../../api/runs";

const runs: RunSummary[] = [
  {
    id: "bee_2",
    workflowId: "wf1",
    status: "failed",
    startedAt: "2026-10-15T10:00:00.000Z",
    finishedAt: "2026-10-15T10:01:05.000Z",
    message: "Process COUNT failed: exit status 127",
  },
  {
    id: "bee_1",
    workflowId: "wf1",
    status: "succeeded",
    startedAt: "2026-10-15T09:00:00.000Z",
    finishedAt: "2026-10-15T09:00:30.000Z",
  },
];
const listRuns = vi.fn(async (_workflowId: string) => runs);
const getRunLog = vi.fn(
  async (id: string) =>
    `log of ${id}\nERROR ~ boom\nCommand error:\n  .command.sh: line 2: fastqc: command not found`,
);
const listRunResults = vi.fn(async (_id: string) => []);
vi.mock("../../../api/runs", () => ({
  listRuns: (id: string) => listRuns(id),
  getRunLog: (id: string) => getRunLog(id),
  listRunResults: (id: string) => listRunResults(id),
  runResultUrl: (id: string, path: string) => `/api/${id}/${path}`,
}));

const { default: RunHistory, RunLog } = await import("./RunHistory");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => {});

describe("RunHistory", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lists the workflow's runs and shows a run's message and log", async () => {
    act(() => root.render(<RunHistory workflowId="wf1" />));
    await flush();
    expect(listRuns).toHaveBeenCalledWith("wf1");
    const buttons = container.querySelectorAll(
      '[aria-label="Earlier runs"] button',
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("failed");
    expect(buttons[0].textContent).toContain("1m 5s");

    act(() => (buttons[0] as HTMLButtonElement).click());
    await flush();
    expect(getRunLog).toHaveBeenCalledWith("bee_2");
    expect(container.textContent).toContain("exit status 127");
    const log = container.querySelector('[aria-label="Log of run bee_2"]');
    expect(log?.textContent).toContain("log of bee_2");
    expect(log?.querySelector(".text-red-300")?.textContent).toContain(
      "ERROR ~ boom",
    );
    // A recognised reason is explained above the log.
    expect(
      container.querySelector('[aria-label="Why the run failed"]')?.textContent,
    ).toContain("runs “fastqc”, which isn't installed");
  });

  it("asks to save a workflow that has no id", async () => {
    act(() => root.render(<RunHistory workflowId={null} />));
    await flush();
    expect(listRuns).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Save the workflow");
  });

  it("says when there are no runs", async () => {
    listRuns.mockResolvedValueOnce([]);
    act(() => root.render(<RunHistory workflowId="wf1" />));
    await flush();
    expect(container.textContent).toContain("hasn't been run");
  });

  it("RunLog copies the whole log", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    act(() => root.render(<RunLog text={"line 1\nERROR ~ boom"} />));
    const button = container.querySelector(
      '[aria-label="Copy run log"]',
    ) as HTMLButtonElement;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("line 1\nERROR ~ boom");
    expect(button.textContent).toContain("Copied");
  });

  it("RunLog shows a placeholder until there is output", () => {
    act(() => root.render(<RunLog text="" />));
    expect(container.textContent).toContain("No output yet");
  });
});

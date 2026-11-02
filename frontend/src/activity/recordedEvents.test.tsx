// Verbose mode: the events recorded where they happen (one test each).

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Edge, Node } from "@xyflow/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";

vi.mock("../api", () => ({ default: { post: vi.fn(async () => ({ data: {} })) }, isDemoMode: false }));

const { recorded, startRecording, stopRecording } = await import("./activityTesting");
const { rejectedConnection } = await import("../context/WorkflowContext");
const { describeClick, useClickRecorder } = await import("./useClickRecorder");
const { default: Term } = await import("../components/common/ui/Term");
const { default: HelpPage } = await import("../pages/HelpPage");
const { default: FailureExplanationCard } = await import("../components/common/workflow/FailureExplanationCard");
const { default: RecordingIndicator } = await import("./RecordingIndicator");
const { downloadScript } = await import("../pages/workflow/workflowExport");
const { getCurrentTest } = await import("./activityLog");
const { DEFAULT_EXECUTION_SETTINGS } = await import("../pages/workflow/executionSettings");

const ClickRecorder = () => {
  useClickRecorder();
  return (
    <div>
      <button type="button" aria-label="Fit view">
        <svg />
      </button>
      <a href="/help">
        Help <span>page</span>
      </a>
      <button type="button" role="tab">
        Code
      </button>
      <input aria-label="Name" />
    </div>
  );
};

const failure = {
  kind: "command-not-found" as const,
  title: "A program the step needs isn't installed",
  explanation: "The step runs “fastqc”, which isn't installed where it ran (exit status 127).",
  fix: "Turn on Docker in the execution settings.",
  docs: "https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#command-not-found",
  process: "NFCORE_FASTQC_QC",
  certainty: "certain" as const,
  alternatives: [],
  evidence: [{ text: "bash: fastqc: command not found", line: 3 }],
};

describe("recorded events", () => {
  beforeEach(() => {
    localStorage.clear();
    startRecording();
  });
  afterEach(() => stopRecording());

  it("connection.rejected: where it was dropped, and the reason shown", () => {
    const nodes = [
      { id: "a", type: "outputDisplay", position: { x: 0, y: 0 }, data: { label: "Out" } },
      { id: "b", type: "outputDisplay", position: { x: 0, y: 0 }, data: { label: "Out 2" } },
    ] as Node<NodeData>[];
    const edges: Edge[] = [
      { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
    ];
    const handle = (nodeId: string, id: string, type: "source" | "target") =>
      ({ nodeId, id, type, position: "left", x: 0, y: 0, width: 1, height: 1 }) as never;
    // From an input back to an output: a loop.
    const rejected = rejectedConnection(
      { isValid: false, fromHandle: handle("a", "in", "target"), toHandle: handle("b", "out", "source") },
      nodes,
      edges,
    );
    expect(rejected).toMatchObject({ source: "b", sourceHandle: "out", target: "a", targetHandle: "in" });
    expect(typeof rejected?.reason).toBe("string");
    expect(
      rejectedConnection({ isValid: null, fromHandle: handle("a", "out", "source"), toHandle: null }, nodes, edges),
    ).toBeNull();
    expect(
      rejectedConnection(
        { isValid: true, fromHandle: handle("a", "out", "source"), toHandle: handle("b", "in", "target") },
        nodes,
        edges,
      ),
    ).toBeNull();
  });

  it("ui.click: buttons, links and tabs by the name people see, not fields", () => {
    render(<ClickRecorder />);
    fireEvent.click(screen.getByRole("button", { name: "Fit view" }).querySelector("svg") as Element);
    fireEvent.click(screen.getByText("page"));
    fireEvent.click(screen.getByRole("tab"));
    fireEvent.click(screen.getByLabelText("Name"));
    expect(recorded("ui.click").map((event) => event.data)).toEqual([
      { element: "button", name: "Fit view" },
      { element: "link", name: "Help page" },
      { element: "tab", name: "Code" },
    ]);
    expect(describeClick(null)).toBeNull();
  });

  it("glossary.opened: the term, each time its explanation opens", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Term id="tuple">tuple</Term>
      </MemoryRouter>,
    );
    await user.hover(screen.getByRole("button", { name: "About “Tuple”" }));
    expect(recorded("glossary.opened").map((event) => event.data)).toEqual([{ term: "tuple" }]);
  });

  it("help.opened: once per visit to Help", () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(recorded("help.opened")).toHaveLength(1);
  });

  it("failure.explained: once, though it shows in the run panel and the notice", () => {
    render(
      <>
        <FailureExplanationCard explanation={failure} />
        <FailureExplanationCard explanation={failure} tone="dark" />
      </>,
    );
    expect(recorded("failure.explained").map((event) => event.data)).toEqual([
      { kind: "command-not-found", title: failure.title, certainty: "certain", process: "NFCORE_FASTQC_QC" },
    ]);
  });

  it("failure.feedback: the answer to Did this help?", () => {
    render(<FailureExplanationCard explanation={failure} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(recorded("failure.feedback").map((event) => event.data)).toEqual([
      { kind: "command-not-found", certainty: "certain", helpful: false },
    ]);
    expect(screen.getByRole("status").textContent).toContain("recorded");
  });

  it("workflow.exported: the script", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    downloadScript({ nodes: [], edges: [], workflowName: "Empty",
      settings: DEFAULT_EXECUTION_SETTINGS,
      rawSource: null,
      sourceFormat: "visual",
    });
    expect(recorded("workflow.exported").map((event) => event.data)).toEqual([{ kind: "script" }]);
  });

  it("test.started / test.ended from the marker at the top of every page", async () => {
    const user = userEvent.setup();
    render(<RecordingIndicator />);
    expect(screen.getByRole("region", { name: "Verbose mode recording" }).textContent).toContain("Recording");
    await user.click(screen.getByRole("button", { name: "Start test" }));
    await user.type(screen.getByLabelText("Test label (optional)"), "P07 task 1");
    await user.click(screen.getByRole("button", { name: "Start" }));
    const test = getCurrentTest();
    expect(screen.getByRole("region", { name: "Verbose mode recording" }).textContent).toContain("Test “P07 task 1”");
    await user.click(screen.getByRole("button", { name: "End test" }));
    expect(getCurrentTest()).toBeNull();
    expect(recorded().filter((event) => event.type.startsWith("test.")).map((event) => [event.type, event.test, event.data])).toEqual([
      ["test.started", test?.id, { label: "P07 task 1" }],
      ["test.ended", test?.id, { label: "P07 task 1" }],
    ]);
  });

  it("shows no marker while verbose mode is off", () => {
    startRecording({ verbose: false });
    render(<RecordingIndicator />);
    expect(screen.queryByRole("region", { name: "Verbose mode recording" })).toBeNull();
  });
});

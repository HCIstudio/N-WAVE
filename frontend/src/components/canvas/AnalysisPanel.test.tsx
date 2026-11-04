import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recorded, startRecording, stopRecording } from "../../activity/activityTesting";
import type { WorkflowAnalysis } from "../../analysis/analysis";
import type { BioflowResult } from "../../analysis/bioflow";
import type { WorkflowAnalysisState } from "../../analysis/useWorkflowAnalysis";
import results from "../../demo/analysisResults.json";
import type { NodeData } from "../nodes/BaseNode";
import AnalysisPanel from "./AnalysisPanel";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(stopRecording);

const recordedResult = Object.values(results as unknown as Record<string, { bioflow: { result: BioflowResult } }>)[0]
  .bioflow.result;
const nodes = [{ id: "n-qc", type: "process", position: { x: 0, y: 0 }, data: { label: "QC" } }] as Node<NodeData>[];

const analysis = (overrides: Partial<WorkflowAnalysis> = {}): WorkflowAnalysis => ({
  script: "",
  owners: new Map([[5, "n-qc"]]),
  names: new Map([["n-qc", "QC"]]),
  lint: {
    status: "done",
    result: {
      tool: { name: "nextflow lint", image: "x" },
      files: ["main.nf"],
      problems: [{ level: "error", file: "main.nf", line: 5, column: 3, message: "`sample` is not defined" }],
    },
  },
  bioflow: { status: "done", result: recordedResult },
  ...overrides,
});

const state = (overrides: Partial<WorkflowAnalysisState> = {}): WorkflowAnalysisState => ({
  analysis: analysis(),
  current: true,
  structureCurrent: true,
  running: false,
  error: null,
  problems: [],
  analyse: vi.fn(async () => {}),
  ...overrides,
});

const renderPanel = (panelState: WorkflowAnalysisState, onShowNode = vi.fn()) =>
  render(
    <AnalysisPanel
      state={panelState}
      nodes={nodes}
      workflowName="My workflow"
      nodeLabels={{ "n-qc": "QC" }}
      onShowNode={onShowNode}
      onClose={vi.fn()}
    />,
  );

describe("AnalysisPanel", () => {
  it("lists what the code check found, each with its node", async () => {
    const onShowNode = vi.fn();
    renderPanel(state(), onShowNode);
    const list = screen.getByRole("list", { name: "Problems in the code" });
    expect(within(list).getByText(/`sample` is not defined \(nextflow lint, line 5\)/)).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: "Show “QC”" }));
    expect(onShowNode).toHaveBeenCalledWith("n-qc");
    expect(screen.getByText(/don't keep the workflow from running/)).toBeTruthy();
  });

  it("shows the structure's numbers, and credits BioFlow-Insight", () => {
    renderPanel(state());
    expect(screen.getByText("Steps", { selector: "dt" }).nextElementSibling?.textContent).toBe(String(recordedResult.steps.length));
    expect(screen.getByRole("link", { name: "BioFlow-Insight (Marchment et al., 2024)" }).getAttribute("href")).toBe(
      "https://doi.org/10.1093/nargab/lqae092",
    );
  });

  it("says when the workflow changed since, and analyses again", async () => {
    const panelState = state({ current: false });
    renderPanel(panelState);
    expect(screen.getByText(/The workflow changed since this analysis/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Analyse again" }));
    expect(panelState.analyse).toHaveBeenCalled();
  });

  it("says which tool isn't available and why", () => {
    renderPanel(
      state({
        analysis: analysis({
          lint: { status: "unavailable", reason: "Nextflow's lint runs in Docker, and Docker is not available." },
          bioflow: { status: "failed", reason: "The analysis took longer than 120 s and was stopped." },
        }),
      }),
    );
    expect(screen.getByText(/nextflow lint isn't available: Nextflow's lint runs in Docker/)).toBeTruthy();
    expect(screen.getByText(/BioFlow-Insight failed: The analysis took longer/)).toBeTruthy();
    expect(screen.getByText(/The structure comes from BioFlow-Insight, which isn't available here/)).toBeTruthy();
  });

  it("switches views and downloads the structure (recorded in verbose mode)", async () => {
    startRecording();
    renderPanel(state());
    await userEvent.click(screen.getByRole("tab", { name: "Steps and channels" }));
    expect(screen.getByRole("tab", { name: "Steps and channels" }).getAttribute("aria-selected")).toBe("true");
    expect(recorded("analysis.structureViewed").map((event) => event.data)).toEqual([{ view: "channels" }]);
    await userEvent.click(screen.getByRole("button", { name: "Mermaid" }));
    await userEvent.click(screen.getByRole("button", { name: "Dot" }));
    expect(recorded("analysis.downloaded").map((event) => event.data)).toEqual([
      { format: "mermaid", view: "channels" },
      { format: "dot", view: "channels" },
    ]);
  });
});

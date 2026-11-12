import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { stopRecording } from "../../activity/activityTesting";
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

const renderPanel = (panelState: WorkflowAnalysisState, onShowNode = vi.fn(), onOpenView = vi.fn()) =>
  render(
    <AnalysisPanel
      state={panelState}
      nodes={nodes}
      workflowName="My workflow"
      nodeLabels={{ "n-qc": "QC" }}
      onShowNode={onShowNode}
      onOpenView={onOpenView}
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

  it("opens the graph views of the structure, and credits BioFlow-Insight", async () => {
    const onOpenView = vi.fn();
    renderPanel(state(), vi.fn(), onOpenView);
    await userEvent.click(screen.getByRole("button", { name: "Specification graph" }));
    await userEvent.click(screen.getByRole("button", { name: "Process dependency graph" }));
    expect(onOpenView.mock.calls).toEqual([["specification"], ["dependencies"]]);
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
    // Without BioFlow-Insight's reading, there is no structure to open.
    expect(screen.queryByRole("button", { name: "Specification graph" })).toBeNull();
  });
});

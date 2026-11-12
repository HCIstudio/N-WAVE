import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recorded, startRecording, stopRecording } from "../../activity/activityTesting";
import type { WorkflowAnalysis } from "../../analysis/analysis";
import type { BioflowResult } from "../../analysis/bioflow";
import type { WorkflowAnalysisState } from "../../analysis/useWorkflowAnalysis";
import results from "../../demo/analysisResults.json";
import GraphView from "./GraphView";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(stopRecording);

const rnaseq = Object.values(results as unknown as Record<string, { bioflow: { result: BioflowResult } }>)
  .map((entry) => entry.bioflow.result)
  .find((result) => result.subworkflows.length > 0) as BioflowResult;

const analysis: WorkflowAnalysis = {
  script: "",
  owners: new Map(),
  names: new Map([["MULTIQC", "n-multiqc"]]),
  lint: { status: "unavailable", reason: "not here" },
  bioflow: { status: "done", result: rnaseq },
};

const state = (overrides: Partial<WorkflowAnalysisState> = {}): WorkflowAnalysisState => ({
  analysis,
  current: true,
  structureCurrent: true,
  running: false,
  error: null,
  problems: [],
  analyse: vi.fn(async () => {}),
  ...overrides,
});

const show = (overrides: Partial<WorkflowAnalysisState> = {}, props: Partial<React.ComponentProps<typeof GraphView>> = {}) => {
  const onBack = vi.fn();
  const onShowInEditor = vi.fn();
  const view = state(overrides);
  render(
    <div style={{ width: 1200, height: 800 }}>
      <GraphView kind="dependencies" analysis={view} unavailable={null} onBack={onBack} onShowInEditor={onShowInEditor} {...props} />
    </div>,
  );
  return { onBack, onShowInEditor, view };
};

const node = (label: string) =>
  [...document.querySelectorAll(".react-flow__node")].find((element) => element.textContent?.startsWith(label)) as HTMLElement;

describe("GraphView", () => {
  it("says it is read-only and not the editor, and goes back to it", () => {
    const { onBack } = show();
    const title = screen.getByRole("region", { name: "Process dependency graph view" });
    expect(title.textContent).toContain("Read-only");
    fireEvent.click(within(title).getByRole("button", { name: "Back to the editor" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("sums up the structure", () => {
    show();
    const insights = screen.getByRole("complementary", { name: "What the structure tells" });
    expect(within(insights).getByText("Processes").nextElementSibling?.textContent).toBe(String(rnaseq.steps.length));
    expect(within(insights).getByRole("list", { name: "Longest chain" }).children.length).toBeGreaterThan(2);
  });

  it("shows what a selected process depends on and what a change to it affects (recorded in verbose mode)", () => {
    startRecording();
    const { onShowInEditor } = show();
    fireEvent.click(node("FILTER_GTF"));
    const selected = screen.getByRole("region", { name: "Selected" });
    expect(selected.textContent).toContain("FILTER_GTF");
    expect(selected.textContent).toMatch(/A change to it affects \d+ processes/);
    expect(recorded("graph.inspected").map((event) => event.data)).toEqual([{ view: "dependencies", kind: "step" }]);
    // MULTIQC has a node of its own in the editor.
    fireEvent.click(node("MULTIQC"));
    fireEvent.click(within(screen.getByRole("region", { name: "Selected" })).getByRole("button", { name: "Show in the editor" }));
    expect(onShowInEditor).toHaveBeenCalledWith("n-multiqc");
  });

  it("collapses a subworkflow into one box and expands it again", () => {
    show();
    const before = document.querySelectorAll(".react-flow__node").length;
    fireEvent.click(screen.getByRole("button", { name: "Collapse SAMTOOLS_SORT_INDEX_STATS" }));
    expect(document.querySelectorAll(".react-flow__node").length).toBeLessThan(before);
    fireEvent.click(screen.getByRole("button", { name: "Expand SAMTOOLS_SORT_INDEX_STATS" }));
    expect(document.querySelectorAll(".react-flow__node").length).toBe(before);
  });

  it("analyses the workflow when its analysis isn't current, and says so meanwhile", async () => {
    const { view } = show({ analysis: null, structureCurrent: false });
    await act(async () => {});
    expect(view.analyse).toHaveBeenCalledTimes(1);
    expect(screen.getByText("BioFlow-Insight is reading the workflow's code")).toBeTruthy();
  });

  it("is greyed out in the demo, saying a full install is needed", () => {
    const { view } = show({}, { unavailable: { reason: "The browser demo has no server.", demo: true } });
    expect(screen.getByRole("status").textContent).toContain("The browser demo has no server.");
    expect(screen.getByRole("status").textContent).toContain("Needs a full install of N-WAVE.");
    expect(view.analyse).not.toHaveBeenCalled();
  });
});

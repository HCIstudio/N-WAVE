import { describe, expect, it } from "vitest";
import recorded from "../demo/analysisResults.json";
import type { BioflowResult } from "./bioflow";
import {
  clusterNodeId,
  criticalPath,
  type GraphModel,
  graphModel,
  layoutGraph,
  type Rect,
  reachOf,
  shownGraph,
  structureInsight,
} from "./graphViews";

const results = Object.values(recorded as unknown as Record<string, { bioflow: { result: BioflowResult } }>).map(
  (entry) => entry.bioflow.result,
);
// The rebuilt RNA-seq example: processes in nested nf-core subworkflows.
const rnaseq = results.find((result) => result.subworkflows.length > 0) as BioflowResult;
const OUTER = "SAMTOOLS_SORT_INDEX_STATS";
const INNER = "SAMTOOLS_SORT_INDEX_STATS.BAM_STATS_SAMTOOLS";

/** A → (operation) → B → D, A → C → D: two branches that can run side by side. */
const diamond: GraphModel = {
  kind: "specification",
  nodes: [
    { id: "A", kind: "step", label: "A", subworkflow: null, code: "", conditions: [] },
    { id: "op1", kind: "operation", label: "ch.map{}", subworkflow: null, code: "ch.map{}", conditions: [] },
    { id: "B", kind: "step", label: "B", subworkflow: "S", code: "", conditions: ["params.b"] },
    { id: "C", kind: "step", label: "C", subworkflow: null, code: "", conditions: [] },
    { id: "D", kind: "step", label: "D", subworkflow: null, code: "", conditions: [] },
  ],
  edges: [
    { from: "A", to: "op1", label: "" },
    { from: "op1", to: "B", label: "" },
    { from: "A", to: "C", label: "" },
    { from: "B", to: "D", label: "" },
    { from: "C", to: "D", label: "" },
  ],
  clusters: [{ id: "S", name: "SUB", workflow: "SUB", parent: null }],
};

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe("graph views", () => {
  it("are BioFlow-Insight's two graphs: every process and operation, or the processes only", () => {
    const dependencies = graphModel(rnaseq, "dependencies") as GraphModel;
    expect(dependencies.nodes.length).toBe(rnaseq.steps.length);
    expect(dependencies.nodes.every((node) => node.kind === "step")).toBe(true);
    expect(dependencies.edges.length).toBe(rnaseq.connections.length);
    const specification = graphModel(rnaseq, "specification") as GraphModel;
    expect(specification.nodes.length).toBe(rnaseq.specification?.nodes.length);
    expect(specification.nodes.filter((node) => node.kind === "step").length).toBe(rnaseq.steps.length);
    expect(specification.nodes.find((node) => node.id === `${INNER}.SAMTOOLS_STATS`)?.subworkflow).toBe(INNER);
    expect(graphModel({ ...rnaseq, specification: null }, "specification")).toBeNull();
  });

  it("collapse a subworkflow into one box, its connections drawn to the box", () => {
    const model = graphModel(rnaseq, "dependencies") as GraphModel;
    const open = shownGraph(model, new Set());
    expect(open.frames.map((frame) => frame.id).sort()).toEqual([OUTER, INNER]);

    const shown = shownGraph(model, new Set([OUTER]));
    const box = shown.nodes.find((node) => node.id === clusterNodeId(OUTER));
    const inOuter = rnaseq.steps.filter((step) => step.subworkflow?.startsWith(OUTER)).length;
    expect(box?.holds).toEqual({ steps: inOuter, operations: 0 });
    expect(shown.nodes.length).toBe(rnaseq.steps.length - inOuter + 1);
    expect(shown.frames).toEqual([]);
    // No edges inside the box, and none twice.
    expect(shown.edges.some((edge) => edge.from === edge.to)).toBe(false);
    expect(new Set(shown.edges.map((edge) => `${edge.from}>${edge.to}`)).size).toBe(shown.edges.length);
    expect(shown.edges.some((edge) => edge.to === clusterNodeId(OUTER))).toBe(true);

    // Only the inner one collapsed: it is a box inside the outer frame.
    const nested = shownGraph(model, new Set([INNER]));
    expect(nested.nodes.find((node) => node.id === clusterNodeId(INNER))?.container).toBe(OUTER);
    expect(nested.frames.map((frame) => frame.id)).toEqual([OUTER]);
  });

  it("are laid out left to right, without overlaps, each subworkflow in its frame", () => {
    for (const kind of ["dependencies", "specification"] as const) {
      const model = graphModel(rnaseq, kind) as GraphModel;
      for (const collapsed of [new Set<string>(), new Set([INNER]), new Set([OUTER])]) {
        const shown = shownGraph(model, collapsed);
        const layout = layoutGraph(shown);
        const rects = [...layout.nodes.values()];
        expect(rects.length).toBe(shown.nodes.length);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
        for (const node of shown.nodes) {
          if (node.container) expect(inside(layout.nodes.get(node.id) as Rect, layout.frames.get(node.container) as Rect)).toBe(true);
          else
            for (const frame of layout.frames.values()) expect(overlaps(layout.nodes.get(node.id) as Rect, frame)).toBe(false);
        }
        // Data flows to the right between things in the same place.
        for (const edge of shown.edges) {
          const from = shown.nodes.find((node) => node.id === edge.from);
          const to = shown.nodes.find((node) => node.id === edge.to);
          if (from?.container === to?.container)
            expect((layout.nodes.get(edge.to) as Rect).x).toBeGreaterThan((layout.nodes.get(edge.from) as Rect).x);
        }
      }
    }
  });

  it("tell what depends on what, through operations", () => {
    const reach = reachOf(diamond);
    expect([...(reach.get("A")?.downstream ?? [])].sort()).toEqual(["B", "C", "D", "op1"]);
    expect([...(reach.get("D")?.upstream ?? [])].sort()).toEqual(["A", "B", "C", "op1"]);
    expect([...(reach.get("C")?.downstream ?? [])]).toEqual(["D"]);
    // The longest chain counts processes; the operation on it is kept in its path.
    expect(criticalPath(diamond)).toEqual(["A", "op1", "B", "D"]);
  });

  it("sum up the structure: size, depth, what runs side by side, where it starts and ends", () => {
    const insight = structureInsight(diamond);
    expect(insight).toMatchObject({
      steps: 4,
      operations: 1,
      dependencies: 4,
      subworkflows: 1,
      conditionalSteps: 1,
      longestChain: 3,
      parallelWidth: 2,
      entrySteps: ["A"],
      endSteps: ["D"],
      conditional: ["B"],
    });
    expect(insight.mostDependedOn[0]).toEqual({ id: "A", count: 3 });
    expect(insight.mostDependencies[0]).toEqual({ id: "D", count: 3 });

    const real = structureInsight(graphModel(rnaseq, "dependencies") as GraphModel);
    expect(real.steps).toBe(rnaseq.steps.length);
    expect(real.longestChain).toBeGreaterThan(2);
    expect(real.parallelWidth).toBeGreaterThan(1);
    expect(real.entrySteps.length).toBeGreaterThan(0);
  });

  it("follow loops without hanging", () => {
    const loop: GraphModel = {
      ...diamond,
      edges: [...diamond.edges, { from: "D", to: "A", label: "" }],
    };
    expect(criticalPath(loop).length).toBeGreaterThan(0);
    expect(layoutGraph(shownGraph(loop, new Set())).nodes.size).toBe(loop.nodes.length);
  });
});

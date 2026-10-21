import type { Connection, Edge, Node } from "@xyflow/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { demoWorkflowSeed } from "../demo/demoWorkflow";
import star from "../demo/rnaseqStarSalmonExample.json";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import qcFastq from "../templates/qcFastqTemplate.json";
import { registerNfCoreNodes } from "../../scripts/lint/fixtures";
import { makeNode } from "../test/nodes";
import catalog from "./nfcore/catalog.json";
import { acceptsManyConnections, connectionLimitMessage, edgesIntoPort, findExtraConnections } from "./portArity";

const starNodes = (star as unknown as { nodes: Node<NodeData>[] }).nodes;
const starEdges = (star as unknown as { edges: Edge[] }).edges;
const byId = (id: string) => starNodes.find((node) => node.id === id) as Node<NodeData>;

const withId = (id: string, node: Node<NodeData>): Node<NodeData> => ({ ...node, id });
const edge = (source: string, target: string, targetHandle = "in"): Edge => ({
  id: `${source}-${target}-${targetHandle}`,
  source,
  sourceHandle: "out",
  target,
  targetHandle,
});
const connection = (source: string, target: string, targetHandle = "in"): Connection => ({
  source,
  sourceHandle: "out",
  target,
  targetHandle,
});

beforeAll(() => registerNfCoreNodes(starNodes));

describe("how many connections an input takes", () => {
  it("is one for most inputs, any number for Merge and collecting nf-core inputs", () => {
    expect(acceptsManyConnections(makeNode("merge"), "in")).toBe(true);
    expect(acceptsManyConnections(makeNode("filter"), "in")).toBe(false);
    expect(acceptsManyConnections(makeNode("outputDisplay"), "in")).toBe(false);
    expect(acceptsManyConnections(byId("multiqc"), "multiqc_files")).toBe(true);
    expect(acceptsManyConnections(byId("multiqc"), "multiqc_config")).toBe(false);
    expect(acceptsManyConnections(byId("star_align"), "reads")).toBe(false);
  });

  it("marks only the nf-core inputs that collect files from many steps", () => {
    // Every path input staged with `collect` in the pinned catalog.
    const collecting = (catalog as { modules: Array<{ id: string; inputGroups?: Array<{ items?: Array<{ kind: string; name: string; mode?: string }> }> }> }).modules
      .flatMap((module) =>
        (module.inputGroups ?? []).flatMap((group) =>
          (group.items ?? []).filter((item) => item.kind === "path" && item.mode === "collect").map((item) => `${module.id}:${item.name}`),
        ),
      )
      .sort();
    expect(collecting).toEqual([
      "nf-core/ataqv/mkarv:jsons",
      "nf-core/custom/rsemmergecounts:genes",
      "nf-core/custom/rsemmergecounts:isoforms",
      "nf-core/custom/tx2gene:quants",
      "nf-core/drep/compare:fastas",
      "nf-core/force/cube:mask",
      "nf-core/gtdbtk/classifywf:bins",
      "nf-core/multiqc:multiqc_files",
      "nf-core/sageproteomics/sage:mzML",
      "nf-core/tximeta/tximport:quants",
    ]);
  });

  it("refuses a second connection into a one-connection input", () => {
    const filter = withId("f", makeNode("filter"));
    const existing = [edge("a", "f")];
    expect(connectionLimitMessage(connection("b", "f"), filter, existing)).toBe(
      "“Filter” takes one connection. To combine several, connect them to a Merge node first, or mix them in a channel operator.",
    );
    // The first connection, and reconnecting the same edge, are fine.
    expect(connectionLimitMessage(connection("a", "f"), filter, [])).toBeNull();
    expect(connectionLimitMessage(connection("a", "f"), filter, existing)).toBeNull();
    // Edges saved without a handle count for the first input.
    expect(connectionLimitMessage(connection("b", "f"), filter, [{ ...edge("a", "f"), targetHandle: null }])).not.toBeNull();
  });

  it("allows any number into Merge and names the input on nodes with several", () => {
    const merge = withId("m", makeNode("merge"));
    expect(connectionLimitMessage(connection("b", "m"), merge, [edge("a", "m")])).toBeNull();
    expect(connectionLimitMessage(connection("x", "multiqc", "multiqc_files"), byId("multiqc"), starEdges)).toBeNull();
    expect(connectionLimitMessage(connection("x", "star_align", "index"), byId("star_align"), starEdges)).toBe(
      "“STAR alignment” takes one connection on “Index”. To combine several, connect them to a Merge node first, or mix them in a channel operator.",
    );
  });

  it("finds one-connection inputs with several connections, and none in the examples", () => {
    const filter = withId("f", makeNode("filter"));
    expect(findExtraConnections([filter], [edge("a", "f"), edge("b", "f")])).toEqual([
      { node: filter, handle: "in", count: 2 },
    ]);
    const merge = withId("m", makeNode("merge"));
    expect(findExtraConnections([merge], [edge("a", "m"), edge("b", "m")])).toEqual([]);
    for (const example of [demoWorkflowSeed, star, qcFastq] as unknown as Array<{ nodes: Node<NodeData>[]; edges: Edge[] }>) {
      registerNfCoreNodes(example.nodes);
      expect(findExtraConnections(example.nodes, example.edges)).toEqual([]);
    }
  });

  it("lists the edges into one input", () => {
    const filter = withId("f", makeNode("filter"));
    expect(edgesIntoPort(filter, [edge("a", "f"), edge("b", "g")], "in").map((e) => e.source)).toEqual(["a"]);
  });
});

describe("generated scripts", () => {
  it("use every connection into an input, mixed", () => {
    const input = (id: string): Node<NodeData> =>
      withId(id, makeNode("fileInput", { files: [{ name: `${id}.txt`, content: "x", size: 1 }] }));
    const filter = withId("f", makeNode("filter"));
    const fileEdge = (source: string): Edge => ({ ...edge(source, "f"), sourceHandle: "ch_files_out" });
    const script = generateNextflowScript([input("a"), input("b"), filter], [fileEdge("a"), fileEdge("b")], "wf", "results", "{workflow_name}");
    // A saved workflow with two connections into Filter: neither is dropped
    // (the workflow check asks to merge them before a run).
    expect(script).toMatch(/\(ch_files_a\.concat\(ch_files_b\)\)|ch_files_a\.concat\(ch_files_b\)/);
  });
});

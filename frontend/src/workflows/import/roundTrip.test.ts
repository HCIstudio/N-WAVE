import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { buildLintFixtures } from "../../../scripts/lint/fixtures";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { registerDynamicNodeDefinitions } from "../../registry/nodeDefinitions";
import catalog from "../../registry/nfcore/catalog.json";
import { importNextflowScript, type NfCoreCatalogForImport } from "./importScript";

// Export → import → export gives the same script and the same canvas, for
// every built-in example and every node combination the lint fixtures cover.

const generate = (nodes: Node<NodeData>[], edges: Edge[], name: string) =>
  generateNextflowScript(nodes, edges, name, "results", "{workflow_name}");

/**
 * What a canvas is, without ids: each node's type, label and place, and its
 * connections. A channel operator's ports are named after the channels its
 * code reads and writes once imported, so `loose` compares those by node.
 */
const shapeOf = (nodes: Node<NodeData>[], edges: Edge[], loose = false) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const end = (id: string, handle: string | null | undefined) => {
    const node = byId.get(id);
    const port = loose && node?.type === "channelOperator" ? "*" : node?.type === "fileInput" ? "out" : handle;
    return `${node?.data.label}.${port}`;
  };
  return {
    nodes: nodes
      .map((node) => `${node.type} "${node.data.label}" @${Math.round(node.position.x)},${Math.round(node.position.y)}`)
      .sort(),
    edges: [...new Set(edges.map((edge) => `${end(edge.source, edge.sourceHandle)} -> ${end(edge.target, edge.targetHandle)}`))].sort(),
  };
};

describe("export, import, export", () => {
  for (const fixture of buildLintFixtures()) {
    it(`gives ${fixture.name} back as it was`, () => {
      const first = generate(fixture.nodes, fixture.edges, fixture.description);
      const imported = importNextflowScript(first, { catalog: catalog as unknown as NfCoreCatalogForImport });
      registerDynamicNodeDefinitions(imported.definitions);
      const second = generate(imported.nodes, imported.edges, imported.name ?? fixture.description);
      expect(second).toBe(first);
      expect(shapeOf(imported.nodes, imported.edges, true)).toEqual(shapeOf(fixture.nodes, fixture.edges, true));

      // From then on nothing changes at all, ports included.
      const again = importNextflowScript(second, { catalog: catalog as unknown as NfCoreCatalogForImport });
      expect(shapeOf(again.nodes, again.edges)).toEqual(shapeOf(imported.nodes, imported.edges));
      expect(again.nodes.map((node) => node.data)).toEqual(imported.nodes.map((node) => node.data));
    });
  }
});

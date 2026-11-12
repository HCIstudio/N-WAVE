// How many connections an input takes. Most take one: a second connection
// is refused, since a step's input is one channel. Inputs that gather files
// from many steps (Merge, MultiQC's reports) take any number, mixed into one
// channel. Edges saved before this rule into a one-connection input still
// load; the workflow check asks to merge them first.

import { branchOf } from "../branches/branches";
import type { Connection, Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import { getNodeDefinitionForNode } from "./nodeDefinitions";

/** The input port an edge goes into; edges saved without a handle use the first input. */
const targetPortName = (node: Node<NodeData>, handle: string | null | undefined): string | undefined =>
  handle ?? getNodeDefinitionForNode(node)?.inputs?.[0]?.name ?? node.data.inputs?.[0]?.name;

const inputPort = (node: Node<NodeData>, handle: string | undefined): PortData | undefined =>
  handle === undefined
    ? undefined
    : (getNodeDefinitionForNode(node)?.inputs?.find((port) => port.name === handle) ??
      node.data.inputs?.find((port) => port.name === handle));

/** Whether an input takes any number of connections. */
export const acceptsManyConnections = (node: Node<NodeData>, handle: string | null | undefined): boolean =>
  inputPort(node, targetPortName(node, handle))?.multiple === true;

/** The edges into one input of a node, those saved without a handle included. */
export const edgesIntoPort = <E extends Pick<Edge, "target" | "targetHandle">>(
  node: Node<NodeData>,
  edges: E[],
  handle: string,
): E[] => edges.filter((edge) => edge.target === node.id && targetPortName(node, edge.targetHandle) === handle);

const sameEdge = (edge: Edge, connection: Connection): boolean =>
  edge.source === connection.source &&
  edge.target === connection.target &&
  (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
  (edge.targetHandle ?? null) === (connection.targetHandle ?? null);

/** An input's name as its node shows it. */
export const inputLabel = (node: Node<NodeData>, handle: string): string =>
  inputPort(node, handle)?.label || handle;

const inputName = (node: Node<NodeData>, handle: string | undefined): string => {
  const ports = getNodeDefinitionForNode(node)?.inputs ?? node.data.inputs ?? [];
  return ports.length > 1 && handle ? ` on “${inputLabel(node, handle)}”` : "";
};

/** Why a new connection is refused, or null when the input has room for it. */
export const connectionLimitMessage = (
  connection: Connection,
  targetNode: Node<NodeData> | undefined,
  edges: Edge[],
  /** The workflow's nodes: an arm of a branch may connect where another arm already does. */
  nodes: Node<NodeData>[] = [],
): string | null => {
  if (!targetNode) return null;
  const handle = targetPortName(targetNode, connection.targetHandle);
  if (!handle || acceptsManyConnections(targetNode, handle)) return null;
  const others = edgesIntoPort(targetNode, edges, handle).filter((edge) => !sameEdge(edge, connection));
  if (others.length === 0) return null;
  // Each from another arm of the same branch (if/else): only one of them runs.
  const armOf = (id: string) => {
    const node = nodes.find((candidate) => candidate.id === id);
    return node ? branchOf(node, nodes) : null;
  };
  const incoming = armOf(connection.source);
  if (
    incoming &&
    others.every((edge) => {
      const arm = armOf(edge.source);
      return arm !== null && arm.id === incoming.id && arm.arm !== incoming.arm;
    })
  ) {
    return null;
  }
  const label = String(targetNode.data.label || targetNode.type);
  return `“${label}” takes one connection${inputName(targetNode, handle)}. To combine several, connect them to a Merge node first, or mix them in a channel operator.`;
};

export interface ExtraConnections {
  node: Node<NodeData>;
  handle: string;
  count: number;
}

/** One-connection inputs that have more (workflows saved before the rule). */
export const findExtraConnections = (nodes: Node<NodeData>[], edges: Edge[]): ExtraConnections[] =>
  nodes.flatMap((node) => {
    // Connections from the arms of one branch (if/else) are one: only one arm runs.
    const byHandle = new Map<string, Edge[]>();
    for (const edge of edges) {
      if (edge.target !== node.id) continue;
      const handle = targetPortName(node, edge.targetHandle);
      if (handle) byHandle.set(handle, [...(byHandle.get(handle) ?? []), edge]);
    }
    const counts = new Map<string, number>();
    for (const [handle, into] of byHandle) {
      const perArm = new Map<string, number>();
      let others = 0;
      for (const edge of into) {
        const source = nodes.find((candidate) => candidate.id === edge.source);
        const membership = source ? branchOf(source, nodes) : null;
        if (!membership) others += 1;
        else perArm.set(`${membership.id}:${membership.arm}`, (perArm.get(`${membership.id}:${membership.arm}`) ?? 0) + 1);
      }
      const branches = new Map<string, number>();
      for (const [key, count] of perArm) {
        const id = key.slice(0, key.lastIndexOf(":"));
        branches.set(id, Math.max(branches.get(id) ?? 0, count));
      }
      counts.set(handle, others + [...branches.values()].reduce((sum, count) => sum + count, 0));
    }
    return [...counts]
      .filter(([handle, count]) => count > 1 && !acceptsManyConnections(node, handle))
      .map(([handle, count]) => ({ node, handle, count }));
  });


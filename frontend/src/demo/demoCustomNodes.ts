// Custom node storage for the backend-less demo, kept in localStorage. Mirrors
// the backend's /api/custom-nodes responses.

import type { StoredCustomNode } from "../registry/customNodes";
import type { WorkflowDescriptor, WorkflowNode } from "../types/backend";
import { DemoStoreError, demoStore } from "./demoStore";

const STORAGE_KEY = "nwave.demo.customNodes";

const read = (): StoredCustomNode[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    // Drop malformed entries so one bad record can't break the whole list.
    return Array.isArray(parsed)
      ? (parsed as unknown[]).filter(
          (node): node is StoredCustomNode =>
            !!node &&
            typeof node === "object" &&
            typeof (node as StoredCustomNode).id === "string",
        )
      : [];
  } catch {
    return [];
  }
};

const write = (nodes: StoredCustomNode[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
};

const isInstanceOf = (node: WorkflowNode, id: string): boolean =>
  node?.data?.customNodeId === id;

/**
 * Applies `edit` to every saved workflow holding an instance of custom node
 * `id`. Returns the number of workflows changed.
 */
const editSavedWorkflows = (
  id: string,
  edit: (
    workflow: WorkflowDescriptor,
  ) => Pick<WorkflowDescriptor, "nodes" | "edges">,
): number => {
  let updated = 0;
  for (const workflow of demoStore.list()) {
    if (workflow.isBuiltin) continue;
    if (!workflow.nodes.some((node) => isInstanceOf(node, id))) continue;
    demoStore.update(workflow._id, edit(workflow));
    updated += 1;
  }
  return updated;
};

/** Mirrors the backend's applyCustomNodeDefinitionToWorkflowNode(). */
const applyDefinition = (
  node: WorkflowNode,
  customNode: StoredCustomNode,
): WorkflowNode => {
  const inputs = customNode.inputs ?? [];
  const valueInputs = inputs.filter((input) => input.kind === "val");
  const previousValues = (node.data.customNodeValues ?? {}) as Record<
    string,
    unknown
  >;
  const toPort = (port: {
    name: string;
    label?: string;
    fileType?: string;
    filePattern?: string;
  }) => ({
    name: port.name,
    label: port.label,
    fileType: port.fileType,
    filePattern: port.filePattern,
    isConnectable: true,
  });
  return {
    ...node,
    data: {
      ...node.data,
      label: customNode.label,
      subtitle: "Custom node",
      icon: customNode.icon,
      processType: customNode.processType,
      customNodeDefinition: customNode,
      customNodeValueInputs: valueInputs,
      customNodeValues: Object.fromEntries(
        valueInputs.map((input) => [
          input.name,
          previousValues[input.name] ?? input.defaultValue ?? "",
        ]),
      ),
      inputs: inputs.filter((input) => input.kind === "path").map(toPort),
      outputs: (customNode.outputs ?? []).map(toPort),
    } as WorkflowNode["data"],
  };
};

/** Mirrors the backend's updateWorkflowsForCustomNode(). */
const updateSavedWorkflows = (customNode: StoredCustomNode): number => {
  const validInputs = new Set(
    (customNode.inputs ?? [])
      .filter((input) => input.kind === "path")
      .map((input) => input.name),
  );
  const validOutputs = new Set(
    (customNode.outputs ?? []).map((output) => output.name),
  );
  return editSavedWorkflows(customNode.id, (workflow) => {
    const affected = new Set<string>();
    const nodes = workflow.nodes.map((node) => {
      if (!isInstanceOf(node, customNode.id)) return node;
      affected.add(node.id);
      return applyDefinition(node, customNode);
    });
    // Check both ends: an edge may join two instances of this node.
    const edges = workflow.edges.filter(
      (edge) =>
        (!affected.has(edge.source) ||
          !edge.sourceHandle ||
          validOutputs.has(edge.sourceHandle)) &&
        (!affected.has(edge.target) ||
          !edge.targetHandle ||
          validInputs.has(edge.targetHandle)),
    );
    return { nodes, edges };
  });
};

/** Mirrors the backend's purgeCustomNodeFromWorkflows(). */
const purgeFromSavedWorkflows = (id: string): number =>
  editSavedWorkflows(id, (workflow) => {
    const removed = new Set(
      workflow.nodes
        .filter((node) => isInstanceOf(node, id))
        .map((node) => node.id),
    );
    return {
      nodes: workflow.nodes.filter((node) => !removed.has(node.id)),
      edges: workflow.edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target),
      ),
    };
  });

export const demoCustomNodes = {
  list(): { schemaVersion: number; nodes: StoredCustomNode[] } {
    const nodes = read().sort((a, b) =>
      String(a.label || a.id).localeCompare(String(b.label || b.id)),
    );
    return { schemaVersion: 1, nodes };
  },

  /** Insert or replace a node by id. */
  save(node: StoredCustomNode): {
    node: StoredCustomNode;
    updatedWorkflows: number;
  } {
    if (!node || typeof node.id !== "string" || node.id.trim() === "") {
      throw new DemoStoreError(400, "Custom node id is required");
    }
    write([...read().filter((existing) => existing.id !== node.id), node]);
    return { node, updatedWorkflows: updateSavedWorkflows(node) };
  },

  /** Remove a node; returns false when it didn't exist. */
  remove(id: string): boolean {
    const nodes = read();
    const remaining = nodes.filter((node) => node.id !== id);
    write(remaining);
    if (remaining.length === nodes.length) return false;
    purgeFromSavedWorkflows(id);
    return true;
  },
};

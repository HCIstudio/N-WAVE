import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { getErrorMessage } from "../utils/errors";
import { saveCustomNodeSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";
import { changeWorkflowGraphs, type WorkflowRevisionChange } from "../workflows/revisions";
import type { JsonObject, WorkflowEdge, WorkflowNode } from "../workflows/types";

interface CustomNodeRegistry {
  schemaVersion: number;
  nodes: unknown[];
}

/** The parts of a stored custom node definition the backend reads. */
interface CustomNodePort {
  name: string;
  label?: string;
  kind?: string;
  fileType?: string;
  filePattern?: string;
  defaultValue?: unknown;
}

interface CustomNodeDefinition {
  id: string;
  label?: string;
  icon?: string;
  processType?: string;
  inputs?: CustomNodePort[];
  outputs?: CustomNodePort[];
}

const asObject = (value: unknown): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

const getNodeData = (node: WorkflowNode): JsonObject =>
  asObject(node.data) ?? {};

const isCustomNodeInstance = (node: WorkflowNode, nodeId: string): boolean =>
  getNodeData(node).customNodeId === nodeId;

export const listCustomNodes = (_req: Request, res: Response): void => {
  try {
    res.json(loadRegistry());
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to load custom nodes",
      error: getErrorMessage(error),
    });
  }
};

export const saveCustomNode = async (
  req: Request,
  res: Response
): Promise<void> => {
  const body = parseBody(saveCustomNodeSchema, req, res);
  if (!body) return;

  try {
    const { node } = body;
    const nodeId = node.id;

    const nodePath = getNodeFilePath(nodeId);
    const existed = fs.existsSync(nodePath);
    // Ids that differ only in case or punctuation share a file name.
    const storedId = existed ? readStoredNodeId(nodePath) : undefined;
    if (storedId !== undefined && storedId !== nodeId) {
      res.status(409).json({
        message: `Custom node id "${nodeId}" clashes with the existing node "${storedId}"`,
      });
      return;
    }
    // Workflows first: if one can't take the definition, the node file stays
    // as it was.
    const workflows = await updateWorkflowsForCustomNode(node);
    writeNodeFile(nodePath, node);

    // `workflows` lets an open editor that made the same change itself take
    // the new revision instead of seeing its next save refused.
    res.status(existed ? 200 : 201).json({
      node,
      nodePath,
      updatedWorkflows: workflows.length,
      workflows,
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to save custom node",
      error: getErrorMessage(error),
    });
  }
};

export const deleteCustomNode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const nodeId = String(req.params.id ?? "").trim();
    if (!nodeId) {
      res.status(400).json({ message: "Custom node id is required" });
      return;
    }

    const nodePath = getNodeFilePath(nodeId);
    const storedId = fs.existsSync(nodePath)
      ? (readStoredNodeId(nodePath) ?? nodeId)
      : undefined;
    if (storedId !== nodeId) {
      res.status(404).json({ message: "Custom node not found" });
      return;
    }

    fs.unlinkSync(nodePath);
    let workflows: WorkflowRevisionChange[] = [];
    let workflowCleanupError: string | undefined;
    try {
      workflows = await purgeCustomNodeFromWorkflows(nodeId);
    } catch (cleanupError: unknown) {
      workflowCleanupError =
        getErrorMessage(cleanupError) || "Workflow cleanup failed";
      console.error(
        `Failed to purge custom node ${nodeId} from saved workflows:`,
        cleanupError
      );
    }
    res
      .status(200)
      .json({
        id: nodeId,
        nodePath,
        updatedWorkflows: workflows.length,
        workflows,
        workflowCleanupError,
      });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to delete custom node",
      error: getErrorMessage(error),
    });
  }
};

const purgeCustomNodeFromWorkflows = (
  nodeId: string
): Promise<WorkflowRevisionChange[]> =>
  changeWorkflowGraphs({ "nodes.data.customNodeId": nodeId }, ({ nodes, edges }) => {
    const removedNodeIds = new Set(
      nodes
        .filter((node) => isCustomNodeInstance(node, nodeId))
        .map((node) => node.id)
        .filter(Boolean)
    );
    if (removedNodeIds.size === 0) return null;
    return {
      nodes: nodes.filter((node) => !removedNodeIds.has(node.id)),
      edges: edges.filter(
        (edge) =>
          !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      ),
    };
  });

const updateWorkflowsForCustomNode = async (
  customNode: CustomNodeDefinition
): Promise<WorkflowRevisionChange[]> => {
  const nodeId = customNode.id.trim();
  if (!nodeId) return [];
  const validInputs = new Set<unknown>(
    getCustomPathInputs(customNode).map((input) => input.name)
  );
  const validOutputs = new Set<unknown>(
    getCustomOutputs(customNode).map((output) => output.name)
  );

  return changeWorkflowGraphs({ "nodes.data.customNodeId": nodeId }, ({ nodes, edges }) => {
    const affectedNodeIds = new Set<unknown>();
    const nextNodes = nodes.map((node) => {
      if (!isCustomNodeInstance(node, nodeId)) return node;
      affectedNodeIds.add(node.id);
      return applyCustomNodeDefinitionToWorkflowNode(node, customNode);
    });
    if (affectedNodeIds.size === 0) return null;

    // Check both ends: an edge can join two instances of the node.
    const nextEdges = edges.filter(
      (edge: WorkflowEdge) =>
        (!affectedNodeIds.has(edge.source) ||
          !edge.sourceHandle ||
          validOutputs.has(edge.sourceHandle)) &&
        (!affectedNodeIds.has(edge.target) ||
          !edge.targetHandle ||
          validInputs.has(edge.targetHandle))
    );
    return { nodes: nextNodes, edges: nextEdges };
  });
};

const applyCustomNodeDefinitionToWorkflowNode = (
  node: WorkflowNode,
  customNode: CustomNodeDefinition
): WorkflowNode => {
  const valueInputs = getCustomValueInputs(customNode);
  const nodeData = getNodeData(node);
  const previousValues = asObject(nodeData.customNodeValues) ?? {};

  return {
    ...node,
    data: {
      ...nodeData,
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
        ])
      ),
      inputs: getCustomPathInputs(customNode).map((input) => ({
        name: input.name,
        label: input.label,
        fileType: input.fileType,
        filePattern: input.filePattern,
        isConnectable: true,
      })),
      outputs: getCustomOutputs(customNode).map((output) => ({
        name: output.name,
        label: output.label,
        fileType: output.fileType,
        filePattern: output.filePattern,
        isConnectable: true,
      })),
    },
  };
};

const getCustomPathInputs = (
  customNode: CustomNodeDefinition
): CustomNodePort[] =>
  (customNode.inputs ?? []).filter((input) => input.kind === "path");

const getCustomValueInputs = (
  customNode: CustomNodeDefinition
): CustomNodePort[] =>
  (customNode.inputs ?? []).filter((input) => input.kind === "val");

const getCustomOutputs = (customNode: CustomNodeDefinition): CustomNodePort[] =>
  customNode.outputs ?? [];

const loadRegistry = (): CustomNodeRegistry => {
  const nodeDirectory = getNodeDirectory();
  fs.mkdirSync(nodeDirectory, { recursive: true });
  migrateLegacyRegistry(nodeDirectory);

  const nodes = fs
    .readdirSync(nodeDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(nodeDirectory, entry.name))
    .map((nodePath): unknown => JSON.parse(fs.readFileSync(nodePath, "utf8")))
    .filter((node): node is JsonObject => asObject(node) !== undefined)
    .sort((a, b) =>
      String(a.label ?? a.id ?? "").localeCompare(String(b.label ?? b.id ?? ""))
    );

  return {
    schemaVersion: 1,
    nodes,
  };
};

const writeNodeFile = (nodePath: string, node: unknown): void => {
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(`${nodePath}.tmp`, `${JSON.stringify(node, null, 2)}\n`);
  fs.renameSync(`${nodePath}.tmp`, nodePath);
};

const readStoredNodeId = (nodePath: string): string | undefined => {
  try {
    const stored = asObject(JSON.parse(fs.readFileSync(nodePath, "utf8")));
    return typeof stored?.id === "string" ? stored.id.trim() : undefined;
  } catch {
    return undefined;
  }
};

const migrateLegacyRegistry = (nodeDirectory: string): void => {
  const legacyPath = getLegacyRegistryPath();
  if (!fs.existsSync(legacyPath)) return;

  const parsed = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  for (const node of nodes) {
    const nodeId = String(node?.id ?? "").trim();
    if (!nodeId) continue;
    const nodePath = path.join(nodeDirectory, `${toFileBaseName(nodeId)}.json`);
    if (!fs.existsSync(nodePath)) {
      writeNodeFile(nodePath, node);
    }
  }
  // Retire the file so nodes deleted later don't come back on the next load.
  fs.renameSync(legacyPath, `${legacyPath}.migrated`);
};

const getNodeFilePath = (nodeId: string): string =>
  path.join(getNodeDirectory(), `${toFileBaseName(nodeId)}.json`);

const getNodeDirectory = (): string => {
  if (process.env.NWAVE_CUSTOM_NODE_DIR) {
    return path.resolve(process.env.NWAVE_CUSTOM_NODE_DIR);
  }

  if (process.env.NWAVE_CUSTOM_NODE_REGISTRY) {
    const configured = path.resolve(process.env.NWAVE_CUSTOM_NODE_REGISTRY);
    return path.extname(configured)
      ? path.join(path.dirname(configured), "nodes")
      : configured;
  }

  const repoRelativeCandidate = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "frontend",
    "src",
    "registry",
    "custom",
    "nodes"
  );
  const candidates = [
    path.resolve(
      process.cwd(),
      "..",
      "frontend",
      "src",
      "registry",
      "custom",
      "nodes"
    ),
    path.resolve(
      process.cwd(),
      "frontend",
      "src",
      "registry",
      "custom",
      "nodes"
    ),
    path.resolve(process.cwd(), "src", "registry", "custom", "nodes"),
    repoRelativeCandidate,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? repoRelativeCandidate;
};

const getLegacyRegistryPath = (): string =>
  path.resolve(getNodeDirectory(), "..", "userCustomNodes.json");

const toFileBaseName = (value: string): string => {
  const safeName = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safeName || "custom-node";
};

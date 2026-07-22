import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import WorkflowModel from "../models/WorkflowModel";

interface CustomNodeRegistry {
  schemaVersion: number;
  nodes: unknown[];
}

export const listCustomNodes = (_req: Request, res: Response): void => {
  try {
    res.json(loadRegistry());
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to load custom nodes",
      error: error.message,
    });
  }
};

export const saveCustomNode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const node = req.body?.node;
    if (!node || typeof node !== "object") {
      res.status(400).json({ message: "Custom node payload is required" });
      return;
    }

    const nodeId = String(node.id ?? "").trim();
    if (!nodeId) {
      res.status(400).json({ message: "Custom node id is required" });
      return;
    }

    const nodePath = getNodeFilePath(nodeId);
    const existed = fs.existsSync(nodePath);
    writeNodeFile(nodePath, node);
    const updatedWorkflows = await updateWorkflowsForCustomNode(node);

    res.status(existed ? 200 : 201).json({
      node,
      nodePath,
      updatedWorkflows,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to save custom node",
      error: error.message,
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
    if (!fs.existsSync(nodePath)) {
      res.status(404).json({ message: "Custom node not found" });
      return;
    }

    fs.unlinkSync(nodePath);
    let updatedWorkflows = 0;
    let workflowCleanupError: string | undefined;
    try {
      updatedWorkflows = await purgeCustomNodeFromWorkflows(nodeId);
    } catch (cleanupError: any) {
      workflowCleanupError = cleanupError?.message || "Workflow cleanup failed";
      console.error(
        `Failed to purge custom node ${nodeId} from saved workflows:`,
        cleanupError
      );
    }
    res
      .status(200)
      .json({ id: nodeId, nodePath, updatedWorkflows, workflowCleanupError });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to delete custom node",
      error: error.message,
    });
  }
};

const purgeCustomNodeFromWorkflows = async (
  nodeId: string
): Promise<number> => {
  const workflows = await WorkflowModel.find({
    "nodes.data.customNodeId": nodeId,
  });
  let updatedCount = 0;

  for (const workflow of workflows) {
    const removedNodeIds = new Set(
      workflow.nodes
        .filter((node: any) => node?.data?.customNodeId === nodeId)
        .map((node: any) => node.id)
        .filter(Boolean)
    );
    if (removedNodeIds.size === 0) continue;

    workflow.nodes = workflow.nodes.filter(
      (node: any) => !removedNodeIds.has(node?.id)
    );
    workflow.edges = workflow.edges.filter(
      (edge: any) =>
        !removedNodeIds.has(edge?.source) && !removedNodeIds.has(edge?.target)
    );
    workflow.markModified("nodes");
    workflow.markModified("edges");
    await workflow.save();
    updatedCount += 1;
  }

  return updatedCount;
};

const updateWorkflowsForCustomNode = async (
  customNode: any
): Promise<number> => {
  const nodeId = String(customNode?.id ?? "").trim();
  if (!nodeId) return 0;

  const workflows = await WorkflowModel.find({
    "nodes.data.customNodeId": nodeId,
  });
  let updatedCount = 0;

  for (const workflow of workflows) {
    let changed = false;
    const affectedNodeIds = new Set<string>();
    const validInputs = new Set(
      getCustomPathInputs(customNode).map((input: any) => input.name)
    );
    const validOutputs = new Set(
      getCustomOutputs(customNode).map((output: any) => output.name)
    );

    workflow.nodes = workflow.nodes.map((node: any) => {
      if (node?.data?.customNodeId !== nodeId) return node;
      changed = true;
      affectedNodeIds.add(node.id);
      return applyCustomNodeDefinitionToWorkflowNode(node, customNode);
    });

    if (affectedNodeIds.size > 0) {
      const nextEdges = workflow.edges.filter((edge: any) => {
        if (affectedNodeIds.has(edge?.source)) {
          return !edge.sourceHandle || validOutputs.has(edge.sourceHandle);
        }
        if (affectedNodeIds.has(edge?.target)) {
          return !edge.targetHandle || validInputs.has(edge.targetHandle);
        }
        return true;
      });

      if (nextEdges.length !== workflow.edges.length) {
        workflow.edges = nextEdges;
        changed = true;
      }
    }

    if (!changed) continue;
    workflow.markModified("nodes");
    workflow.markModified("edges");
    await workflow.save();
    updatedCount += 1;
  }

  return updatedCount;
};

const applyCustomNodeDefinitionToWorkflowNode = (
  node: any,
  customNode: any
): any => {
  const valueInputs = getCustomValueInputs(customNode);
  const previousValues = node?.data?.customNodeValues ?? {};

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
        valueInputs.map((input: any) => [
          input.name,
          previousValues[input.name] ?? input.defaultValue ?? "",
        ])
      ),
      inputs: getCustomPathInputs(customNode).map((input: any) => ({
        name: input.name,
        label: input.label,
        fileType: input.fileType,
        filePattern: input.filePattern,
        isConnectable: true,
      })),
      outputs: getCustomOutputs(customNode).map((output: any) => ({
        name: output.name,
        label: output.label,
        fileType: output.fileType,
        filePattern: output.filePattern,
        isConnectable: true,
      })),
    },
  };
};

const getCustomPathInputs = (customNode: any): any[] =>
  Array.isArray(customNode?.inputs)
    ? customNode.inputs.filter((input: any) => input?.kind === "path")
    : [];

const getCustomValueInputs = (customNode: any): any[] =>
  Array.isArray(customNode?.inputs)
    ? customNode.inputs.filter((input: any) => input?.kind === "val")
    : [];

const getCustomOutputs = (customNode: any): any[] =>
  Array.isArray(customNode?.outputs) ? customNode.outputs : [];

const loadRegistry = (): CustomNodeRegistry => {
  const nodeDirectory = getNodeDirectory();
  fs.mkdirSync(nodeDirectory, { recursive: true });
  migrateLegacyRegistry(nodeDirectory);

  const nodes = fs
    .readdirSync(nodeDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(nodeDirectory, entry.name))
    .map((nodePath) => JSON.parse(fs.readFileSync(nodePath, "utf8")))
    .filter((node) => node && typeof node === "object")
    .sort((a: any, b: any) =>
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

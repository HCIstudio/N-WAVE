import { defaultExecutionSettings } from "./defaultExecutionSettings";

interface ImportNextflowWorkflowInput {
  name?: string;
  description?: string;
  rawSource: string;
  sourceKey?: string | null;
}

interface ImportedWorkflowDraft {
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  executionSettings: any;
  originType: "imported";
  sourceFormat: "nextflow";
  sourceKey: string | null;
  rawSource: string;
  importWarnings: string[];
  isBuiltin: false;
  isReadOnly: false;
}

const inferWorkflowName = (rawSource: string): string | null => {
  const workflowMatch = rawSource.match(/workflow\s+([A-Za-z0-9_]+)\s*\{/);
  if (workflowMatch?.[1]) {
    return workflowMatch[1];
  }

  const processMatch = rawSource.match(/process\s+([A-Za-z0-9_]+)\s*\{/);
  if (processMatch?.[1]) {
    return processMatch[1];
  }

  return null;
};

interface ParsedProcess {
  name: string;
  body: string;
}

interface VisualNodeDraft {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

interface VisualEdgeDraft {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  data?: { order: number };
  type: "default";
}

const sanitizeId = (value: string): string =>
  value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "node";

const parseProcesses = (rawSource: string): ParsedProcess[] => {
  const processes: ParsedProcess[] = [];
  const processPattern = /process\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = processPattern.exec(rawSource)) !== null) {
    const processName = match[1];
    if (!processName) continue;

    let depth = 1;
    let cursor = processPattern.lastIndex;
    while (cursor < rawSource.length && depth > 0) {
      const char = rawSource[cursor];
      if (char === "{") depth++;
      if (char === "}") depth--;
      cursor++;
    }

    processes.push({
      name: processName,
      body: rawSource.slice(processPattern.lastIndex, cursor - 1),
    });
    processPattern.lastIndex = cursor;
  }

  return processes;
};

const getWorkflowBody = (rawSource: string): string => {
  const workflowMatch = /workflow(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\{/g.exec(
    rawSource
  );
  if (!workflowMatch) return "";

  let depth = 1;
  let cursor = workflowMatch.index + workflowMatch[0].length;
  const start = cursor;
  while (cursor < rawSource.length && depth > 0) {
    const char = rawSource[cursor];
    if (char === "{") depth++;
    if (char === "}") depth--;
    cursor++;
  }

  return rawSource.slice(start, cursor - 1);
};

const parseSelectedFiles = (rawSource: string): string[] => {
  const match = rawSource.match(/params\.selected_files\s*=\s*\[([\s\S]*?)\]/);
  if (!match?.[1]) return [];

  return match[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
};

const inferProcessNode = (
  process: ParsedProcess,
  index: number
): VisualNodeDraft => {
  const lowerName = process.name.toLowerCase();
  const lowerBody = process.body.toLowerCase();
  const id = `import-${sanitizeId(process.name)}`;
  const basePosition = { x: 320 + index * 240, y: 180 };

  if (lowerName.startsWith("outputdisplay") || lowerName.includes("output")) {
    return {
      id,
      type: "outputDisplay",
      position: basePosition,
      data: {
        label: "Display Output",
        icon: "Eye",
        subtitle: process.name,
        inputs: [{ name: "in" }],
      },
    };
  }

  if (lowerName.startsWith("filter") || lowerBody.includes("grep ")) {
    const grepMatch = process.body.match(/grep\s+(?:-v\s+)?(?:-E\s+)?["']([^"']+)["']/);
    return {
      id,
      type: "operator",
      position: basePosition,
      data: {
        label: "Filter",
        icon: "Funnel",
        subtitle: grepMatch?.[1] ? `Contains ${grepMatch[1]}` : process.name,
        operatorType: "filter",
        filterText: grepMatch?.[1] ?? "",
        filterMode: "contains",
        filterNegate: /\bgrep\s+-v\b/.test(process.body),
        inputs: [{ name: "in" }],
        outputs: [{ name: "out", isConnectable: true }],
      },
    };
  }

  if (
    lowerName.startsWith("map") ||
    lowerBody.includes(" tr ") ||
    lowerBody.includes("sed ")
  ) {
    return {
      id,
      type: "operator",
      position: basePosition,
      data: {
        label: "Map",
        icon: "Wand",
        subtitle: lowerBody.includes("tr '[:lower:]' '[:upper:]'")
          ? "Uppercase"
          : process.name,
        operatorType: "map",
        mapOperation: lowerBody.includes("sed ") ? "replaceText" : "changeCase",
        mapChangeCase: lowerBody.includes("tr '[:upper:]' '[:lower:]'")
          ? "toLowerCase"
          : "toUpperCase",
        inputs: [{ name: "in" }],
        outputs: [{ name: "out", isConnectable: true }],
      },
    };
  }

  if (lowerName.startsWith("merge") || lowerBody.includes("cat $input_files")) {
    return {
      id,
      type: "operator",
      position: basePosition,
      data: {
        label: "Merge",
        icon: "Minimize",
        subtitle: process.name,
        operatorType: "merge",
        mergeOperation: "join",
        inputs: [{ name: "in" }],
        outputs: [{ name: "out", isConnectable: true }],
      },
    };
  }

  return {
    id,
    type: "process",
    position: basePosition,
    data: {
      label: process.name,
      icon: "Cog",
      subtitle: "Imported process",
      inputs: [{ name: "in" }],
      outputs: [{ name: "out", isConnectable: true }],
    },
  };
};

const extractIdentifiers = (expression: string): string[] => {
  const ignored = new Set([
    "collect",
    "file",
    "map",
    "mix",
    "params",
    "view",
    "if",
    "else",
    "true",
    "false",
    "null",
  ]);
  const matches = expression.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
  return [...new Set(matches.filter((match) => !ignored.has(match)))];
};

const buildVisualGraph = (
  rawSource: string
): { nodes: VisualNodeDraft[]; edges: VisualEdgeDraft[]; warnings: string[] } => {
  const processes = parseProcesses(rawSource);
  const selectedFiles = parseSelectedFiles(rawSource);
  const workflowBody = getWorkflowBody(rawSource);
  const warnings: string[] = [];

  const nodes: VisualNodeDraft[] = [];
  const edges: VisualEdgeDraft[] = [];
  const processNodes = new Map<string, VisualNodeDraft>();
  const variableSources = new Map<string, string[]>();

  const needsFileInput =
    selectedFiles.length > 0 || /\bch_files\b/.test(rawSource);
  if (needsFileInput) {
    const fileInputId = "import-file-input";
    nodes.push({
      id: fileInputId,
      type: "fileInput",
      position: { x: 80, y: 180 },
      data: {
        label: "File Input",
        icon: "FolderOpen",
        subtitle:
          selectedFiles.length > 0
            ? `${selectedFiles.length} imported file reference${
                selectedFiles.length === 1 ? "" : "s"
              }`
            : "Imported input channel",
        files: selectedFiles.map((name) => ({
          name,
          size: 0,
          fileType: name.split(".").pop() || "txt",
          content: "",
        })),
        outputs: [{ name: "out", isConnectable: true }],
      },
    });
    variableSources.set("ch_files", [fileInputId]);
  }

  processes.forEach((process, index) => {
    const node = inferProcessNode(process, index);
    nodes.push(node);
    processNodes.set(process.name, node);
  });

  const resolveSources = (expression: string): string[] =>
    extractIdentifiers(expression).flatMap(
      (identifier) => variableSources.get(identifier) ?? []
    );

  const addEdges = (sourceIds: string[], targetNode: VisualNodeDraft) => {
    const uniqueSourceIds = [...new Set(sourceIds)].filter(
      (sourceId) => sourceId !== targetNode.id
    );
    uniqueSourceIds.forEach((sourceId, index) => {
      const sourceNode = nodes.find((node) => node.id === sourceId);
      edges.push({
        id: `import-edge-${edges.length + 1}-${sourceId}-${targetNode.id}`,
        source: sourceId,
        target: targetNode.id,
        sourceHandle: sourceNode?.type === "fileInput" ? "ch_files_out" : "out",
        targetHandle: "in",
        data: { order: index },
        type: "default",
      });
    });
  };

  workflowBody
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .forEach((line) => {
      const assignmentMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)\s*$/
      );
      if (assignmentMatch?.[1] && assignmentMatch[2]) {
        const [, outputVariable, processName, args = ""] = assignmentMatch;
        const targetNode = processNodes.get(processName);
        if (targetNode) {
          const sources = resolveSources(args);
          addEdges(sources, targetNode);
          variableSources.set(outputVariable, [targetNode.id]);
          return;
        }
      }

      const callMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)\s*$/
      );
      if (callMatch?.[1]) {
        const [, processName, args = ""] = callMatch;
        const targetNode = processNodes.get(processName);
        if (targetNode) {
          addEdges(resolveSources(args), targetNode);
          return;
        }
      }

      const channelAssignmentMatch = line.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/
      );
      if (channelAssignmentMatch?.[1] && channelAssignmentMatch[2]) {
        const sources = resolveSources(channelAssignmentMatch[2]);
        if (sources.length > 0) {
          variableSources.set(channelAssignmentMatch[1], sources);
        }
      }
    });

  if (processes.length === 0) {
    warnings.push("No Nextflow process blocks were found to visualize.");
  }
  if (workflowBody.trim() === "") {
    warnings.push("No workflow block was found, so process connections could not be inferred.");
  }
  if (processes.length > 0 && edges.length === 0) {
    warnings.push("Processes were visualized, but no workflow connections could be inferred.");
  }

  return { nodes, edges, warnings };
};

export const importNextflowWorkflow = ({
  name,
  description,
  rawSource,
  sourceKey,
}: ImportNextflowWorkflowInput): ImportedWorkflowDraft => {
  const normalizedSource = rawSource.trim();

  if (!normalizedSource) {
    throw new Error("Nextflow source is required for import.");
  }

  const inferredName = inferWorkflowName(normalizedSource);
  const workflowName =
    name?.trim() || inferredName || "Imported Nextflow Workflow";
  const visualGraph = buildVisualGraph(normalizedSource);

  return {
    name: workflowName,
    description:
      description?.trim() ||
      "Imported from Nextflow source with an inferred visual workflow graph.",
    nodes: visualGraph.nodes,
    edges: visualGraph.edges,
    executionSettings: defaultExecutionSettings,
    originType: "imported",
    sourceFormat: "nextflow",
    sourceKey: sourceKey?.trim() || null,
    rawSource: normalizedSource,
    importWarnings: [
      ...visualGraph.warnings,
    ],
    isBuiltin: false,
    isReadOnly: false,
  };
};

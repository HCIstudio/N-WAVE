import fs from "fs";
import path from "path";
import { defaultExecutionSettings } from "../defaultExecutionSettings";
import { materializeWorkflow } from "../materializeWorkflow";
import { WorkflowDescriptor } from "../types";

const resolveDemoAssetPath = (...relativePathSegments: string[]): string => {
  const candidateDirectories = [
    path.join(__dirname, "assets", "bee_movie_demo"),
    path.join(process.cwd(), "dist", "workflows", "library", "assets", "bee_movie_demo"),
    path.join(process.cwd(), "src", "workflows", "library", "assets", "bee_movie_demo"),
  ];

  for (const directory of candidateDirectories) {
    const candidatePath = path.join(directory, ...relativePathSegments);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Demo workflow asset not found: ${relativePathSegments.join("/")}`
  );
};

const demoWorkflowFilePath = resolveDemoAssetPath("Demo_Workflow.nf");
const demoInputFilePath = resolveDemoAssetPath("bee_movie.txt");

const demoRawSource = fs.readFileSync(demoWorkflowFilePath, "utf-8");
const demoInputContent = fs.readFileSync(demoInputFilePath, "utf-8");

const demoGraphNodes = [
  {
    id: "demo-file-input",
    type: "fileInput",
    position: { x: 80, y: 180 },
    data: {
      label: "File Input",
      icon: "FolderOpen",
      subtitle: "Bee Movie script",
      files: [
        {
          name: "bee_movie.txt",
          size: Buffer.byteLength(demoInputContent, "utf-8"),
          fileType: "txt",
          content: demoInputContent,
        },
      ],
      outputs: [{ name: "out", isConnectable: true }],
    },
  },
  {
    id: "demo-filter-barry",
    type: "operator",
    position: { x: 320, y: 80 },
    data: {
      label: "Filter",
      icon: "Funnel",
      subtitle: "Contains Barry",
      operatorType: "filter",
      filterText: "Barry",
      filterMode: "contains",
      filterNegate: false,
      inputs: [{ name: "in" }],
      outputs: [{ name: "out", isConnectable: true }],
    },
  },
  {
    id: "demo-map-uppercase",
    type: "operator",
    position: { x: 560, y: 80 },
    data: {
      label: "Map",
      icon: "Wand",
      subtitle: "Uppercase",
      operatorType: "map",
      mapTransformation: "uppercase",
      inputs: [{ name: "in" }],
      outputs: [{ name: "out", isConnectable: true }],
    },
  },
  {
    id: "demo-filter-bee",
    type: "operator",
    position: { x: 320, y: 280 },
    data: {
      label: "Filter",
      icon: "Funnel",
      subtitle: "Contains Bee",
      operatorType: "filter",
      filterText: "Bee",
      filterMode: "contains",
      filterNegate: false,
      inputs: [{ name: "in" }],
      outputs: [{ name: "out", isConnectable: true }],
    },
  },
  {
    id: "demo-merge",
    type: "operator",
    position: { x: 820, y: 180 },
    data: {
      label: "Merge",
      icon: "Minimize",
      subtitle: "Combine branches",
      operatorType: "merge",
      inputs: [{ name: "in" }],
      outputs: [{ name: "out", isConnectable: true }],
    },
  },
  {
    id: "demo-output",
    type: "outputDisplay",
    position: { x: 1080, y: 180 },
    data: {
      label: "Display Output",
      icon: "Eye",
      subtitle: "Merged demo result",
      inputs: [{ name: "in" }],
    },
  },
];

const demoGraphEdges = [
  {
    id: "demo-edge-file-filter-barry",
    source: "demo-file-input",
    target: "demo-filter-barry",
    sourceHandle: "ch_files_out",
    targetHandle: "in",
    type: "default",
  },
  {
    id: "demo-edge-filter-barry-map",
    source: "demo-filter-barry",
    target: "demo-map-uppercase",
    sourceHandle: "out",
    targetHandle: "in",
    type: "default",
  },
  {
    id: "demo-edge-file-filter-bee",
    source: "demo-file-input",
    target: "demo-filter-bee",
    sourceHandle: "ch_files_out",
    targetHandle: "in",
    type: "default",
  },
  {
    id: "demo-edge-map-merge",
    source: "demo-map-uppercase",
    target: "demo-merge",
    sourceHandle: "out",
    targetHandle: "in",
    data: { order: 0 },
    type: "default",
  },
  {
    id: "demo-edge-filter-bee-merge",
    source: "demo-filter-bee",
    target: "demo-merge",
    sourceHandle: "out",
    targetHandle: "in",
    data: { order: 1 },
    type: "default",
  },
  {
    id: "demo-edge-merge-output",
    source: "demo-merge",
    target: "demo-output",
    sourceHandle: "out",
    targetHandle: "in",
    type: "default",
  },
];

export const demoWorkflowId = "builtin:demo-basic";

export const getDemoWorkflowDescriptor = (): WorkflowDescriptor =>
  materializeWorkflow({
    id: demoWorkflowId,
    name: "Demo Workflow",
    description:
      "Bundled Bee Movie demo with a source-controlled Nextflow script and input file. Duplicate it to edit, or run it directly as a built-in example.",
    nodes: demoGraphNodes,
    edges: demoGraphEdges,
    executionSettings: defaultExecutionSettings,
    rawSource: demoRawSource,
    sourceType: "builtin",
    sourceFormat: "nextflow",
    sourceKey: "demo/bee-movie",
    isReadOnly: true,
    isBuiltin: true,
  });

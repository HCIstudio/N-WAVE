// Built-in demo workflow used by the browser-only demo (GitHub Pages build).
//
// This mirrors the server-side built-in in
// backend/src/workflows/library/demoWorkflow.ts, but embeds a small sample
// input instead of the full bundled asset so the demo stays lightweight and
// has no backend dependency. The graph (a file input fanning into two filter
// branches that are mapped, merged and displayed) is identical.

export const DEMO_WORKFLOW_ID = "builtin:demo-basic";

// A short, self-contained sample so the "Filter contains Barry / Bee" branches
// actually produce visible results when the generated script is inspected.
const DEMO_INPUT_CONTENT = [
  "Barry the bee wakes up early.",
  "According to all known laws of aviation, a Bee should not be able to fly.",
  "Barry talks to his friend Adam.",
  "The Bee flies to the flower.",
  "Ken is not happy about the Bee.",
  "Barry signs the honey deal.",
].join("\n");

const demoGraphNodes = [
  {
    id: "demo-file-input",
    type: "fileInput",
    position: { x: 80, y: 180 },
    data: {
      label: "File Input",
      icon: "FolderOpen",
      subtitle: "Sample script",
      files: [
        {
          name: "sample.txt",
          size: DEMO_INPUT_CONTENT.length,
          fileType: "txt",
          content: DEMO_INPUT_CONTENT,
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

export const demoWorkflowSeed = {
  id: DEMO_WORKFLOW_ID,
  name: "Demo Workflow",
  description:
    "A bundled example: filter a text file for two keywords, uppercase one branch, then merge and display the result. Duplicate it to create an editable copy.",
  nodes: demoGraphNodes,
  edges: demoGraphEdges,
};

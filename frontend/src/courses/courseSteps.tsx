// The courses on the canvas: what each step explains, and what it asks the
// user to do (a step with `done` goes on once that holds). The canvas course
// runs in the user's copy of Demo 1 (made at the end of the home page course,
// or when it is started from the courses); the nf-core course in an empty
// workflow made for it.

import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import type { CourseContext, CourseStep } from "./courses";
import type { CourseId } from "./courseState";

const node = (id: string) => `.react-flow__node[data-id="${id}"]`;
const ADD_NODE = "[data-tutorial-add-node]";
const BOTTOM_BAR = "[data-tutorial-bottom-bar]";
/** A node the user added to their copy of Demo 1 (its own nodes are demo-…). */
const NEW_NODE = '.react-flow__node:not([data-id^="demo-"])';

/** The nodes Demo 1 comes with: anything else, the user added. */
const isDemoNode = (id: string) => id.startsWith("demo-");
const added = ({ nodes }: CourseContext) => nodes.filter((entry) => !isDemoNode(entry.id));
const connected = ({ edges }: CourseContext, source: (id: string) => boolean, target: (id: string) => boolean) =>
  edges.some((edge) => source(edge.source) && target(edge.target));

const CANVAS: CourseStep[] = [
  {
    text: (
      <>
        This is <strong>your copy</strong> of Demo 1: change anything, the demo stays as it is. Data comes in at the{" "}
        <strong>File Input</strong> (a sample text file) and flows to the right, through the nodes, to the{" "}
        <strong>Display Output</strong>.
      </>
    ),
    target: node("demo-file-input"),
  },
  {
    text: (
      <>
        Every node has settings. <strong>Double-click the Map node</strong> to open them.
      </>
    ),
    target: node("demo-map-uppercase"),
    done: ({ openPanels }) => openPanels.includes("demo-map-uppercase"),
  },
  {
    text: (
      <>
        Map changes each line. Set its <strong>Case to Lowercase</strong>: the nodes after it show the result
        straight away.
      </>
    ),
    target: node("demo-map-uppercase"),
    // The panel's Case setting (the demo's node starts without one: uppercase).
    done: ({ nodes }) =>
      nodes.some((entry) => entry.id === "demo-map-uppercase" && entry.data.mapChangeCase === "toLowerCase"),
  },
  {
    text: (
      <>
        Close the panel (its ×). Now <strong>remove the second Filter</strong> (the one outlined): select it and
        press Delete, or drag it onto the bin at the bottom right. Its connections go with it.
      </>
    ),
    target: node("demo-filter-bee"),
    done: ({ nodes }) => !nodes.some((entry) => entry.id === "demo-filter-bee"),
  },
  {
    text: (
      <>
        Let&apos;s add it back. <strong>Open the + menu</strong> at the top right: every node there is.
      </>
    ),
    target: ADD_NODE,
    done: ({ clicked }) => clicked.has("Add node"),
  },
  {
    text: (
      <>
        <strong>Pick Filter</strong> under Operators (or type its name in the search).
      </>
    ),
    done: (context) => added(context).some((entry) => (entry.data as NodeData).label === "Filter"),
  },
  {
    text: (
      <>
        <strong>Connect it</strong>: drag from the File Input&apos;s output dot (on its right) to the new
        Filter&apos;s input dot (on its left). New nodes go where there is room; the canvas zooms out to
        show it.
      </>
    ),
    target: NEW_NODE,
    done: (context) =>
      connected(context, (id) => id === "demo-file-input", (id) => !isDemoNode(id)),
  },
  {
    text: (
      <>
        And <strong>connect the new Filter to Merge</strong>, so its lines are merged with the other branch.
      </>
    ),
    target: NEW_NODE,
    done: (context) => connected(context, (id) => !isDemoNode(id), (id) => id === "demo-merge"),
  },
  {
    text: (
      <>
        The <strong>bottom bar</strong>: the workflow&apos;s name, the views (the Editor, and two read-only graphs of
        its code), the workflow check, <strong>Run</strong> (with an installation), <strong>Export</strong> and
        saving (automatic).
      </>
    ),
    target: BOTTOM_BAR,
  },
  {
    text: (
      <>
        Bottom left: zoom, undo and redo, the keyboard shortcuts and <strong>Help</strong>, where every term is
        explained.
      </>
    ),
    target: "[data-canvas-controls]",
  },
  {
    text: (
      <>
        <strong>That&apos;s the canvas.</strong> This copy is yours, under Your workflows. Next: build a workflow
        from nf-core tools, from scratch.
      </>
    ),
  },
];

/** A node of the nf-core module `name` (e.g. fastqc). */
const isModule = (entry: Node<NodeData>, name: string) =>
  String((entry.data as NodeData).nwaveNfCoreModuleId ?? (entry.data as NodeData).processType ?? "")
    .toLowerCase()
    .includes(name);
const idsOf = ({ nodes }: CourseContext, test: (entry: Node<NodeData>) => boolean) =>
  new Set(nodes.filter(test).map((entry) => entry.id));

const NFCORE: CourseStep[] = [
  {
    text: (
      <>
        An empty workflow, made for this course. You&apos;ll build a <strong>quality check of sequencing reads</strong>
        : the reads come in, <strong>FastQC</strong> checks each sample, <strong>MultiQC</strong> sums it up in one
        report. Both are tested tools from nf-core.
      </>
    ),
  },
  {
    text: (
      <>
        Reads come in through a <strong>Samplesheet</strong>: a table of samples and their FASTQ files. Open the{" "}
        <strong>+ menu</strong> and <strong>add a Samplesheet</strong> (under Inputs).
      </>
    ),
    target: ADD_NODE,
    done: ({ nodes }) => nodes.some((entry) => entry.type === "samplesheet"),
  },
  {
    text: (
      <>
        Now FastQC. In the + menu, open the <strong>nf-core Library</strong>, search <strong>fastqc</strong> and{" "}
        <strong>Install</strong> it. It then is in the menu like any node: <strong>add it to the canvas</strong>.
      </>
    ),
    target: ADD_NODE,
    done: ({ nodes }) => nodes.some((entry) => isModule(entry, "fastqc")),
  },
  {
    text: (
      <>
        <strong>Connect the Samplesheet to FastQC</strong>: from its output dot to FastQC&apos;s reads input. A
        connection that doesn&apos;t fit is marked while you drag.
      </>
    ),
    done: (context) => {
      const sheets = idsOf(context, (entry) => entry.type === "samplesheet");
      const fastqc = idsOf(context, (entry) => isModule(entry, "fastqc"));
      return connected(context, (id) => sheets.has(id), (id) => fastqc.has(id));
    },
  },
  {
    text: (
      <>
        The same for <strong>MultiQC</strong>: install it from the nf-core Library and <strong>add it</strong>.
      </>
    ),
    target: ADD_NODE,
    done: ({ nodes }) => nodes.some((entry) => isModule(entry, "multiqc")),
  },
  {
    text: (
      <>
        <strong>Connect FastQC to MultiQC</strong>: FastQC&apos;s reports (zip) go into MultiQC&apos;s files.
      </>
    ),
    done: (context) => {
      const fastqc = idsOf(context, (entry) => isModule(entry, "fastqc"));
      const multiqc = idsOf(context, (entry) => isModule(entry, "multiqc"));
      return connected(context, (id) => fastqc.has(id), (id) => multiqc.has(id));
    },
  },
  {
    text: (
      <>
        The <strong>workflow check</strong> (next to Run) says what is still missing before it can run: here, the
        Samplesheet has no samples yet. Its button lists the problems; <strong>Show</strong> goes to the node.
      </>
    ),
    target: 'button[aria-label^="Workflow check"]',
  },
  {
    text: (
      <>
        The workflow is real Nextflow. <strong>Open Export</strong> in the bottom bar: the script, or a whole project
        that runs with plain Nextflow, anywhere.
      </>
    ),
    target: 'button[aria-label="Export"]',
    done: ({ clicked }) => clicked.has("Export"),
  },
  {
    text: (
      <>
        <strong>You built a workflow from nf-core tools.</strong> To run it on your data, and for the advanced
        courses (running, analysing, pipelines), N-WAVE needs to be installed on your machine.
      </>
    ),
  },
];

/** The canvas part of each course (the home page course has none: pages/home/HomeTutorial.tsx). */
export const COURSE_STEPS: Record<Exclude<CourseId, "home">, CourseStep[]> = {
  canvas: CANVAS,
  "nfcore-modules": NFCORE,
};

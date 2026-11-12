// The courses on the canvas: what each step explains, and what it asks the
// user to do (a step with `done` goes on once that holds). The canvas course
// runs in the user's copy of Demo 1 (made at the end of the home page course,
// or when it is started from the courses); the nf-core course in an empty
// workflow made for it.

import type { Node } from "@xyflow/react";
import { getCurrentTest, getParticipant } from "../activity/activityLog";
import type { NodeData } from "../components/nodes/BaseNode";
import { currentFeatures } from "../settings/useFeatures";
import type { CourseId } from "./courseState";
import type { CourseContext, CourseStep } from "./courses";

const node = (id: string) => `.react-flow__node[data-id="${id}"]`;
const ADD_NODE = "[data-tutorial-add-node]";
const BOTTOM_BAR = "[data-tutorial-bottom-bar]";
/** A node the user added to their copy of Demo 1 (its own nodes are demo-…). */
const NEW_NODE = '.react-flow__node:not([data-id^="demo-"])';
/** The first node on the canvas (in a workflow that started empty: the user's). */
const NEW_NODE_ANY = ".react-flow__node";

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
        Map changes each line. Set its <strong>Case to Lowercase</strong>: the nodes after it show the result straight
        away.
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
        Close the panel (its ×). Now <strong>remove the second Filter</strong> (the one outlined): select it and press
        Delete, or drag it onto the bin at the bottom right. Its connections go with it.
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
        <strong>Connect it</strong>: drag from the File Input&apos;s output dot (on its right) to the new Filter&apos;s
        input dot (on its left). New nodes go where there is room; the canvas zooms out to show it.
      </>
    ),
    target: NEW_NODE,
    done: (context) =>
      connected(
        context,
        (id) => id === "demo-file-input",
        (id) => !isDemoNode(id),
      ),
  },
  {
    text: (
      <>
        And <strong>connect the new Filter to Merge</strong>, so its lines are merged with the other branch.
      </>
    ),
    target: NEW_NODE,
    done: (context) =>
      connected(
        context,
        (id) => !isDemoNode(id),
        (id) => id === "demo-merge",
      ),
  },
  {
    text: (
      <>
        The <strong>bottom bar</strong>: the workflow&apos;s name, the views (the Editor, and two read-only graphs of
        its code), the workflow check, <strong>Run</strong> (with an installation), <strong>Export</strong> and saving
        (automatic).
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
        <strong>That&apos;s the canvas.</strong> This copy is yours, under Your workflows. Next: build a workflow from
        nf-core tools, from scratch.
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
        An empty workflow, made for this course. You&apos;ll build a <strong>quality check of sequencing reads</strong>:
        the reads come in, <strong>FastQC</strong> checks each sample, <strong>MultiQC</strong> sums it up in one
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
      return connected(
        context,
        (id) => sheets.has(id),
        (id) => fastqc.has(id),
      );
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
      return connected(
        context,
        (id) => fastqc.has(id),
        (id) => multiqc.has(id),
      );
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
        <strong>You built a workflow from nf-core tools.</strong> To run it on your data, and for the advanced courses
        (running, analysing, pipelines), N-WAVE needs to be installed on your machine.
      </>
    ),
  },
];

/** Whether a control whose name starts with `prefix` was clicked during the step. */
const clickedStart = ({ clicked }: CourseContext, prefix: string) =>
  [...clicked].some((name) => name.startsWith(prefix));
const onWorkflow = ({ path }: CourseContext) => path.startsWith("/workflow/");
const EXPORT = 'button[aria-label="Export"]';

// #242: in a copy of Demo 1 made for it.
const IMPORT_EXPORT: CourseStep[] = [
  {
    text: (
      <>
        Your copy of Demo 1, made for this course. A workflow built in N-WAVE is real Nextflow: it goes out as code
        anyone can run, and Nextflow comes in as a canvas.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>Open Export</strong> in the bottom bar.
      </>
    ),
    target: EXPORT,
    done: ({ clicked }) => clicked.has("Export"),
  },
  {
    text: (
      <>
        <strong>Download project</strong>: a folder (as a zip) that runs with plain Nextflow, without N-WAVE. Its README
        says how; your inputs and settings are in it.
      </>
    ),
    done: ({ clicked }) => clicked.has("Download project"),
  },
  {
    text: (
      <>
        Now just the code: open Export again and <strong>Download script</strong>, the workflow&apos;s{" "}
        <code>main.nf</code>. It reads like hand-written Nextflow, named after your nodes.
      </>
    ),
    target: EXPORT,
    done: ({ clicked }) => clicked.has("Download script"),
  },
  {
    text: (
      <>
        One more: <strong>Download DAW model</strong>, the workflow in a format that doesn&apos;t depend on Nextflow,
        for other tools. It imports back into N-WAVE too.
      </>
    ),
    target: EXPORT,
    done: ({ clicked }) => clicked.has("Download DAW model"),
  },
  {
    text: (
      <>
        Now the other way: bring the script you downloaded back in. <strong>Go to the home page</strong> (the house in
        the bottom bar).
      </>
    ),
    done: ({ path }) => path === "/",
  },
  {
    text: (
      <>
        <strong>Import Workflow</strong> (at the top), choose the <code>main.nf</code> you downloaded (or paste its
        code), and <strong>Import</strong>. A whole project zip or the DAW model works the same way.
      </>
    ),
    page: "home",
    target: '[data-tutorial="import"]',
    done: (context) => context.clicked.has("Import") && onWorkflow(context),
  },
  {
    text: (
      <>
        The same canvas, read back from the code: the nodes, their settings and connections, where they were. A script
        written by hand comes in the same way; code N-WAVE has no node for is kept in <strong>Channel code</strong>{" "}
        nodes, and what it couldn&apos;t read is listed at the top.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>You can take workflows out and bring them in.</strong> The imported copy is under Your workflows.
      </>
    ),
  },
];

// #243: in an empty workflow made for it.
const OWN_STEPS: CourseStep[] = [
  {
    text: (
      <>
        An empty workflow, made for this course. When N-WAVE has no node for a tool, you write the step yourself: a{" "}
        <strong>custom process</strong>, a Nextflow process with your own inputs, outputs and script.
      </>
    ),
  },
  {
    text: (
      <>
        Open the <strong>+ menu</strong> and choose <strong>Custom process</strong>.
      </>
    ),
    target: ADD_NODE,
    done: ({ clicked }) => clicked.has("Custom process"),
  },
  {
    text: (
      <>
        It starts from a working example: the first lines of a file. Give it a <strong>Name</strong> (say,{" "}
        <em>Head lines</em>) and <strong>Save Node</strong>. Its inputs, outputs and settings come from the code on the
        right.
      </>
    ),
    done: ({ clicked }) => clicked.has("Save Node"),
  },
  {
    text: (
      <>
        It is a node now, in the <strong>+ menu</strong> under Custom, in every workflow. <strong>Add it</strong> to the
        canvas.
      </>
    ),
    target: ADD_NODE,
    done: ({ nodes }) => nodes.some((entry) => Boolean(entry.data.customNodeId)),
  },
  {
    text: (
      <>
        Double-click it and open its <strong>Code</strong> tab: the process and how the workflow calls it. Change a
        setting and the code follows.
      </>
    ),
    target: NEW_NODE_ANY,
    done: ({ clicked }) => clicked.has("Code"),
  },
  {
    text: (
      <>
        Share it: <strong>+ menu → Node packs → Export</strong>, tick your node, name the pack and{" "}
        <strong>Download pack</strong>.
      </>
    ),
    target: ADD_NODE,
    done: ({ clicked }) => clicked.has("Download pack"),
  },
  {
    text: (
      <>
        <strong>You wrote a step of your own and shared it.</strong> Others install the pack under Node packs → Import,
        from the file or a link; nf-core nodes can be turned into custom nodes too (their Code tab).
      </>
    ),
  },
];

// #244: in a copy of Demo 3 (nf-core/rnaseq rebuilt from nodes) made for it.
const LARGE: CourseStep[] = [
  {
    text: (
      <>
        Your copy of Demo 3: nf-core/rnaseq rebuilt from 14 nodes. If a notice at the top asks for nf-core components,{" "}
        <strong>Install them</strong> first.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>Fit view</strong> (bottom left) shows the whole workflow; the <strong>minimap</strong> above it too,
        colored by node kind. Drag the minimap to move around.
      </>
    ),
    target: '[data-canvas-controls] button[aria-label="Fit view"]',
    done: ({ clicked }) => clicked.has("Fit view"),
  },
  {
    text: (
      <>
        A stacked node holds steps: <strong>SAMtools sort, index, stats</strong> is an nf-core subworkflow.{" "}
        <strong>Step in</strong> (the bar at its bottom) to see them.
      </>
    ),
    target: node("bam_sort_stats"),
    done: (context) => clickedStart(context, "Step in"),
  },
  {
    text: (
      <>
        Its steps, and how they connect; the path at the top leads back out. <strong>Copy into new workflow</strong>{" "}
        there would make them a workflow of your own to change. Close it to go on.
      </>
    ),
  },
  {
    text: (
      <>
        Your own steps can be grouped too. Select <strong>FastQC</strong> and <strong>Trim Galore</strong> (click one,
        Ctrl+click or ⌘+click the other), choose <strong>Group into subworkflow…</strong> above the canvas, name it, and{" "}
        <strong>Group</strong>.
      </>
    ),
    target: node("fastqc_raw"),
    done: ({ nodes }) => nodes.some((entry) => Boolean((entry.data as { group?: unknown }).group)),
  },
  {
    text: (
      <>
        A frame shows the group; click its name to rename or ungroup it. In the code it is a subworkflow of its own, and
        it runs as before.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>That&apos;s finding your way in a large workflow.</strong> With an installation, the Process dependency
        graph shows its parts too (the course Read a workflow&apos;s structure).
      </>
    ),
  },
];

// #245: on Global Settings, no workflow needed.
const STUDIES: CourseStep[] = [
  {
    text: (
      <>
        For studies and teaching: switch N-WAVE&apos;s help features on and off, and record what happens. This is Global
        Settings.
      </>
    ),
    page: "settings",
  },
  {
    text: (
      <>
        Under <strong>Features</strong>, switch off <strong>Connection hints</strong>. It goes for everyone on this
        N-WAVE: compare with and without it in a study.
      </>
    ),
    page: "settings",
    target: '[data-feature="connectionHints"]',
    done: () => !currentFeatures().connectionHints,
  },
  {
    text: (
      <>
        And <strong>switch it on</strong> again. (Switches an installation fixes with <code>NWAVE_FEATURES</code>{" "}
        can&apos;t be changed here.)
      </>
    ),
    page: "settings",
    target: '[data-feature="connectionHints"]',
    done: () => currentFeatures().connectionHints,
  },
  {
    text: (
      <>
        <strong>Verbose mode</strong> records what happens: clicks, changes, runs, the help opened. Tick{" "}
        <strong>Record what happens</strong>. A marker at the top of every page shows it records.
      </>
    ),
    page: "settings",
    done: () => currentFeatures().verbose,
  },
  {
    text: (
      <>
        Give this browser a <strong>Participant ID</strong> (a code like P01, never a name), and press Enter.
      </>
    ),
    page: "settings",
    done: () => getParticipant() !== "",
  },
  {
    text: (
      <>
        Mark a test: <strong>Start test</strong> in the marker at the top, give it a label if you like, and{" "}
        <strong>Start</strong>. Everything until <strong>End test</strong> belongs to it.
      </>
    ),
    page: "settings",
    done: () => getCurrentTest() !== null,
  },
  {
    text: (
      <>
        <strong>End test</strong> in the marker.
      </>
    ),
    page: "settings",
    done: (context) => context.clicked.has("End test") && getCurrentTest() === null,
  },
  {
    text: (
      <>
        <strong>Download ZIP</strong> in Verbose mode: the events as JSON Lines and CSV, with the workflows as they
        were. Choose your test, or a time span.
      </>
    ),
    page: "settings",
    done: ({ clicked }) => clicked.has("Download ZIP"),
  },
  {
    text: (
      <>
        <strong>That&apos;s N-WAVE for studies.</strong> Untick Record what happens when you are done;{" "}
        <strong>Clear log</strong> removes what was recorded.
      </>
    ),
    page: "settings",
  },
];

/** The canvas part of each course (the home page course has none: pages/home/HomeTutorial.tsx). */
export const COURSE_STEPS: Record<Exclude<CourseId, "home">, CourseStep[]> = {
  canvas: CANVAS,
  "import-export": IMPORT_EXPORT,
  "own-steps": OWN_STEPS,
  "large-workflows": LARGE,
  studies: STUDIES,
  "nfcore-modules": NFCORE,
};

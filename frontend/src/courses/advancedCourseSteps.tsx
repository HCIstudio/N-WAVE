// The advanced courses: they run workflows and analyse them, so they need
// N-WAVE installed (the demo shows them greyed out). Each starts in a
// workflow made for it (useStartCourse): a copy of Demo 1 or Demo 2, or a
// Nextflow script imported for it (courseWorkflows.ts).

import { getNodeParameters } from "../registry/params";
import { currentRunDefaults } from "../settings/useRunDefaults";
import type { CourseContext, CourseStep } from "./courses";

const node = (id: string) => `.react-flow__node[data-id="${id}"]`;
/** Run and its Resume switch (the button itself sits clipped inside their frame). */
const RUN = "[data-run-controls]";
const RUN_PANEL = '[aria-label="Run panel"]';
const EXPORT = 'button[aria-label="Export"]';
const EXECUTION_SETTINGS = 'button[aria-label="Execution Settings"]';
const ANALYSE = 'button[aria-label^="Analys"]';
const VIEWS = '[aria-label="Canvas view"]';

const clickedStart = ({ clicked }: CourseContext, prefix: string) =>
  [...clicked].some((name) => name.startsWith(prefix));
/** A run started (it goes, or this page shows one). */
const started = ({ run }: CourseContext) => run.running || run.runId !== null;
/** The run the page shows has ended. */
const ended = ({ run }: CourseContext) => run.runId !== null && !run.running;
/** A custom step's code, as the user edits it in its Code tab. */
const sourceOf = ({ nodes }: CourseContext, id: string): string => {
  const definition = nodes.find((entry) => entry.id === id)?.data.customNodeDefinition as
    | { source?: unknown }
    | undefined;
  return typeof definition?.source === "string" ? definition.source : "";
};

// #246: in a copy of Demo 1 made for it.
const RUN_COURSE: CourseStep[] = [
  {
    text: (
      <>
        Your copy of Demo 1, made for this course. Running it takes Docker: N-WAVE runs the workflow with Nextflow, each
        step in its container.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>Run</strong> it: the green play button in the bottom bar.
      </>
    ),
    target: RUN,
    done: started,
  },
  {
    text: (
      <>
        The <strong>run panel</strong> opens on its <strong>Steps</strong>: each step and its tasks as they run. The
        nodes follow too: running, then done (green).
      </>
    ),
    target: RUN_PANEL,
  },
  {
    text: (
      <>
        Open the <strong>Log</strong> tab: Nextflow&apos;s own output, live.
      </>
    ),
    target: RUN_PANEL,
    done: ({ clicked }) => clicked.has("Log"),
  },
  {
    text: (
      <>
        <strong>Wait for the run to end</strong>: the log says how it went, and every node is green. The first run
        downloads the containers, so it takes longer.
      </>
    ),
    done: ended,
  },
  {
    text: (
      <>
        <strong>Minimize</strong> the run panel (its top right): it shrinks to the Runs bar at the bottom.
      </>
    ),
    target: RUN_PANEL,
    done: ({ run }) => !run.panelOpen,
  },
  {
    text: (
      <>
        And bring it back: <strong>expand</strong> the Runs bar.
      </>
    ),
    target: '[aria-label="Runs"]',
    done: ({ run }) => run.panelOpen,
  },
  {
    text: (
      <>
        What a step made: double-click <strong>Merge</strong> and open its <strong>Results</strong> tab. Its files, to
        open or download.
      </>
    ),
    target: node("demo-merge"),
    done: ({ clicked }) => clicked.has("Results"),
  },
  {
    text: (
      <>
        The workflow&apos;s results: double-click <strong>Display Output</strong>. It shows what reached it, here the
        merged lines.
      </>
    ),
    target: node("demo-output"),
    done: ({ openPanels }) => openPanels.includes("demo-output"),
  },
  {
    text: (
      <>
        Every run is kept: open the run panel&apos;s <strong>History</strong> tab. Open an earlier run there to see its
        log and results again.
      </>
    ),
    target: RUN_PANEL,
    done: ({ clicked }) => clicked.has("History"),
  },
  {
    text: (
      <>
        A run can be stopped: <strong>Run</strong> again, then <strong>Cancel run</strong> at the top of the run panel.
        Its tasks and containers stop.
      </>
    ),
    target: RUN,
    done: (context) => context.clicked.has("Cancel run") && !context.run.running,
  },
  {
    text: (
      <>
        <strong>Go to the home page</strong> (the house in the bottom bar).
      </>
    ),
    done: ({ path }) => path === "/",
  },
  {
    text: (
      <>
        Your workflows show their last run, and <strong>Runs</strong> lists what runs right now, in every workflow.{" "}
        <strong>That&apos;s running a workflow.</strong>
      </>
    ),
    page: "home",
  },
];

// #247: in a workflow imported for it, whose second step fails.
const FAILURES: CourseStep[] = [
  {
    text: (
      <>
        A workflow made for this course: <strong>SAY_HELLO</strong> writes a greeting, <strong>SHOUT</strong> turns it
        into a shout. SHOUT has a mistake.
      </>
    ),
  },
  {
    text: (
      <>
        <strong>Run</strong> it.
      </>
    ),
    target: RUN,
    done: started,
  },
  {
    text: (
      <>
        <strong>Wait for it to fail</strong>: SAY_HELLO finishes, SHOUT doesn&apos;t.
      </>
    ),
    target: node("n-shout"),
    done: (context) => ended(context) && (context.run.explained || Object.values(context.run.steps).includes("failed")),
  },
  {
    text: (
      <>
        Next to the log, N-WAVE says <strong>why the run failed</strong>: the likely cause, how sure it is, and what to
        do. Its evidence is lines of the log: <strong>show one in the log</strong>.
      </>
    ),
    target: '[aria-label="Why the run failed"]',
    done: (context) => clickedStart(context, "Show line"),
  },
  {
    text: (
      <>
        The step that failed is marked on the canvas: SHOUT runs <code>trr</code>, a program that doesn&apos;t exist. A
        typo: it should be <code>tr</code>, which puts the text in capitals.
      </>
    ),
    target: node("n-shout"),
  },
  {
    text: (
      <>
        Fix it: double-click <strong>SHOUT</strong>, open its <strong>Code</strong> tab and{" "}
        <strong>Edit custom node</strong> (the code shown in the tab is read-only). Change <code>trr</code> to{" "}
        <code>tr</code> and <strong>Save Node</strong>.
      </>
    ),
    target: "[data-edit-custom-node]",
    done: (context) => {
      const source = sourceOf(context, "n-shout");
      return source.includes("tr a-z A-Z") && !source.includes("trr");
    },
  },
  {
    text: (
      <>
        <strong>Run</strong> again, with <strong>Resume</strong> on (next to Run): the finished steps come from the run
        cache, and only the rest runs.
      </>
    ),
    target: RUN,
    done: (context) => ended(context) && context.run.steps["n-say_hello"] === "cached",
  },
  {
    text: (
      <>
        SAY_HELLO is <strong>cached</strong> (it didn&apos;t run again), SHOUT ran. For a full run, switch{" "}
        <strong>Resume</strong> off and <strong>Run</strong> again: every step runs, the cache stays.
      </>
    ),
    target: RUN,
    done: (context) =>
      ended(context) &&
      context.run.steps["n-say_hello"] === "succeeded" &&
      context.run.steps["n-shout"] === "succeeded",
  },
  {
    text: (
      <>
        Both steps ran. The cache is in <strong>Execution Settings</strong> → <strong>Run cache</strong>, with its size.
        It needs no clearing for a full run (Resume off does that); <strong>Clear cache</strong> is there if a run ever
        reuses results it shouldn&apos;t, or to free the space.
      </>
    ),
    target: EXECUTION_SETTINGS,
  },
  {
    text: (
      <>
        <strong>That&apos;s a failed run, fixed and resumed.</strong> The Troubleshooting page of the wiki lists every
        failure N-WAVE explains.
      </>
    ),
  },
];

// #248: in a copy of Demo 2 (nf-core/rnaseq as one Pipeline node).
const PIPELINE: CourseStep[] = [
  {
    text: (
      <>
        Your copy of Demo 2: the whole nf-core/rnaseq pipeline as one <strong>Pipeline node</strong>, fed small test
        data by the nodes on its left. The run takes 15 to 30 minutes and at least 6 GB of memory.
      </>
    ),
  },
  {
    text: (
      <>
        Double-click <strong>nf-core/rnaseq</strong>: its settings.
      </>
    ),
    target: node("rnaseq-pipeline"),
    done: ({ openPanels }) => openPanels.includes("rnaseq-pipeline"),
  },
  {
    text: (
      <>
        Every parameter of the pipeline, from its schema, with its help. Its inputs come from the nodes on the left: the{" "}
        <strong>Samplesheet</strong> with the test reads (<code>--input</code>) and the{" "}
        <strong>Reference genome</strong> (<code>--fasta</code>, <code>--gtf</code>).
      </>
    ),
  },
  {
    text: (
      <>
        <strong>Run</strong> it. The first run downloads the pipeline and its containers.
      </>
    ),
    target: RUN,
    done: started,
  },
  {
    text: (
      <>
        <strong>Wait for the run to end.</strong> The run panel&apos;s Steps show the pipeline&apos;s steps as they run;
        you can go on with other things meanwhile.
      </>
    ),
    target: RUN_PANEL,
    done: ended,
  },
  {
    text: (
      <>
        Double-click the pipeline and open its <strong>Results</strong>: the MultiQC report and the pipeline&apos;s
        other reports, to open in the browser.
      </>
    ),
    target: node("rnaseq-pipeline"),
    done: ({ clicked }) => clicked.has("Results"),
  },
  {
    text: (
      <>
        Inside: <strong>Step in</strong> at the bottom of the node shows the pipeline&apos;s own steps.
      </>
    ),
    target: node("rnaseq-pipeline"),
    done: (context) => context.nested !== null || clickedStart(context, "Step in"),
  },
  {
    text: (
      <>
        <strong>That&apos;s an nf-core pipeline in N-WAVE.</strong> Put your own samples in the Samplesheet and your
        genome in Reference genome to run it on your data.
      </>
    ),
  },
];

// #249: in a copy of Demo 1; a cluster isn't needed.
const CLUSTERS: CourseStep[] = [
  {
    text: (
      <>How big runs may be, and where they run. Your copy of Demo 1, made for this course; no cluster is needed.</>
    ),
  },
  {
    text: (
      <>
        Open <strong>Execution Settings</strong> and its <strong>Resources</strong>: this workflow&apos;s CPUs, memory
        and time limit.
      </>
    ),
    target: EXECUTION_SETTINGS,
    done: ({ clicked }) => clicked.has("Resources"),
  },
  {
    text: (
      <>
        A workflow can ask for less than <strong>Run limits</strong> in Global Settings, never more: they are the most
        any run on this N-WAVE may use.
      </>
    ),
    page: "settings",
    target: 'section[aria-labelledby$="-limits"]',
  },
  {
    text: (
      <>
        A <strong>run profile</strong> sends the steps to a cluster (SLURM, AWS Batch) instead of this computer. Under{" "}
        <strong>Run profiles</strong>, add a <strong>SLURM profile</strong>.
      </>
    ),
    page: "settings",
    target: 'section[aria-labelledby$="-profiles"]',
    done: (context) => clickedStart(context, "SLURM"),
  },
  {
    text: (
      <>
        Give it a <strong>name</strong> (say, <em>cluster</em>) and the cluster&apos;s <strong>queue</strong>, then{" "}
        <strong>Save global settings</strong>.
      </>
    ),
    page: "settings",
    target: 'section[aria-labelledby$="-profiles"]',
    done: () => currentRunDefaults().runProfiles.length > 0,
  },
  {
    text: (
      <>
        Back in your workflow: <strong>Execution Settings → Profiles</strong>, and choose your profile.
      </>
    ),
    target: EXECUTION_SETTINGS,
    done: ({ runProfile }) => runProfile !== null,
  },
  {
    text: (
      <>
        <strong>Export → Download project</strong>: its <code>nextflow.config</code> has the profile, so on the cluster{" "}
        <code>nextflow run main.nf -profile cluster</code> runs it there, without N-WAVE.
      </>
    ),
    target: EXPORT,
    done: ({ clicked }) => clicked.has("Download project"),
  },
  {
    text: (
      <>
        <strong>That&apos;s run limits and profiles.</strong> With a cluster reachable from N-WAVE, Run sends the steps
        there too.
      </>
    ),
  },
];

/** The aligner the Parameters node sets in the structure course's workflow. */
const aligner = ({ nodes }: CourseContext): unknown =>
  nodes
    .filter((entry) => entry.type === "parameters")
    .flatMap((entry) => getNodeParameters(entry.data))
    .find((parameter) => parameter.name === "aligner")?.value;

// #250: in a workflow imported for it, with a choice between two aligners (a branch).
const STRUCTURE: CourseStep[] = [
  {
    text: (
      <>
        A workflow imported for this course: trimming, a check, <strong>one of two aligners</strong>, and a report of
        whichever ran. In the code an <code>if</code> chooses the aligner, by the parameter <code>aligner</code>.
      </>
    ),
  },
  {
    text: (
      <>
        That <code>if</code> is the <strong>Branch</strong> node: its condition reads <code>aligner</code> (the dashed
        violet line from Parameters). Its <strong>if</strong> exit leads to ALIGN_STAR, its <strong>else</strong> exit to
        ALIGN_HISAT, each in its lane. REPORT reads whichever ran.
      </>
    ),
    target: "[data-branch]",
  },
  {
    text: (
      <>
        Double-click <strong>Parameters</strong> and set <code>aligner</code> to <code>hisat2</code>: the branch now
        takes the else arm, and ALIGN_STAR greys out (it won&apos;t run).
      </>
    ),
    target: node("n-params"),
    done: (context) => aligner(context) === "hisat2",
  },
  {
    text: (
      <>
        <strong>Analyse</strong> it (bottom bar): <code>nextflow lint</code> and BioFlow-Insight read the code N-WAVE
        generates. The first analysis downloads their images.
      </>
    ),
    target: ANALYSE,
    done: ({ analysis }) => analysis !== null,
  },
  {
    text: (
      <>
        Now an error: double-click <strong>QC</strong>, open its <strong>Code</strong> tab and{" "}
        <strong>Edit custom node</strong>. Change <code>{"${reads}"}</code> to <code>{"${read}"}</code>,{" "}
        <strong>Save Node</strong>, and <strong>Analyse</strong> again. The problem shows on the node and in the workflow
        check.
      </>
    ),
    target: node("n-qc"),
    done: ({ analysis }) => analysis !== null && analysis.problems > 0,
  },
  {
    text: (
      <>
        Change it back to <code>{"${reads}"}</code> the same way and <strong>Analyse</strong> once more: no problems.
      </>
    ),
    target: "[data-edit-custom-node]",
    done: ({ analysis }) => analysis !== null && analysis.problems === 0,
  },
  {
    text: (
      <>
        The canvas has other views of the code. Choose <strong>Specification</strong>: every process and channel
        operation, as the code has them, read-only; the aligners come after the condition that chooses them.
      </>
    ),
    target: VIEWS,
    done: ({ view }) => view === "specification",
  },
  {
    text: (
      <>
        <strong>Dependencies</strong>: which process depends on which. Select <strong>TRIM</strong>: what a change to it
        affects. The side panel has the longest chain, and what runs side by side.
      </>
    ),
    target: VIEWS,
    done: ({ view }) => view === "dependencies",
  },
  {
    text: (
      <>
        Back to the <strong>Editor</strong>.
      </>
    ),
    target: VIEWS,
    done: ({ view }) => view === "editor",
  },
  {
    text: (
      <>
        Steps that belong together can be a subworkflow of their own. Select <strong>TRIM</strong> and{" "}
        <strong>QC</strong> (click one, Ctrl+click or ⌘+click the other), choose{" "}
        <strong>Group into subworkflow…</strong> above the canvas, name it, and <strong>Group</strong>. (The
        analysis&apos;s panel suggests groups too.)
      </>
    ),
    target: node("n-trim"),
    done: ({ nodes }) => nodes.some((entry) => Boolean((entry.data as { group?: unknown }).group)),
  },
  {
    text: (
      <>
        <strong>That&apos;s reading a workflow&apos;s structure.</strong> The Workflow Analysis page of the wiki says
        what each view shows.
      </>
    ),
  },
];

export const ADVANCED_COURSE_STEPS = {
  run: RUN_COURSE,
  failures: FAILURES,
  pipeline: PIPELINE,
  clusters: CLUSTERS,
  structure: STRUCTURE,
};

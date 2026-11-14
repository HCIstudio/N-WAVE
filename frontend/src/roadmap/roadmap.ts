// What N-WAVE does today and what comes next, for the Roadmap page (/roadmap). This file is the
// only place the roadmap lives in the app: update it with every minor release (roadmap.test.ts
// fails until `updatedFor` matches the version in package.json). roadmap.github.test.ts checks
// the issue and milestone numbers against GitHub in CI. The roadmap shows releases in order,
// never with dates.

import { REPOSITORY_URL, type WikiPage } from "../docs/links";

export type RoadmapStatus = "released" | "in-progress" | "planned";

export interface RoadmapFeature {
  title: string;
  /** The GitHub issue that plans it. */
  issue?: number;
  /**
   * Only when it differs from the default: its release's status, or "planned" while the
   * release is in progress. Set "in-progress" while it's being built, "released" once it
   * shipped (e.g. early, in a patch release).
   */
  status?: RoadmapStatus;
}

export interface RoadmapRelease {
  /** "1.5", or "1.1.1" for a named patch release. */
  version: string;
  name: string;
  status: RoadmapStatus;
  /** The release's GitHub milestone. */
  milestone: number;
  /** What it does, in one sentence. */
  goal: string;
  /** Once released: what it brought, in one short line (the roadmap shows released versions small). */
  summary?: string;
  /** Why it matters to people using N-WAVE. */
  why?: string;
  features: RoadmapFeature[];
}

export interface TodayFeature {
  title: string;
  text: string;
  wiki: WikiPage;
}

/** The minor version this file was last brought up to date for. */
export const ROADMAP_UPDATED_FOR = "1.6";

/** The issue that plans the releases below, with their order and dependencies. */
export const ROADMAP_ISSUE = 189;

/** What the current version can do, each with its guide in the wiki. */
export const TODAY: TodayFeature[] = [
  {
    title: "Build workflows on a canvas",
    text: "Connect nodes instead of writing code, with checks while you build, undo, copy and paste, and templates.",
    wiki: "Building-Workflows",
  },
  {
    title: "Use nf-core",
    text: "Over 2,000 nf-core modules, their subworkflows, and whole pipelines such as nf-core/rnaseq.",
    wiki: "nf-core-Library",
  },
  {
    title: "Add your own steps",
    text: "Write custom nodes, and share them with others as node packs.",
    wiki: "Custom-Nodes",
  },
  {
    title: "Run and follow every step",
    text: "Run with Docker or on a SLURM cluster, follow each step live (inside subworkflows and pipelines too), and resume failed runs.",
    wiki: "Running-Workflows",
  },
  {
    title: "Understand failures",
    text: "Common errors are explained in plain language, next to the log and the failing step, with the log lines they are based on and how sure they are.",
    wiki: "Troubleshooting",
  },
  {
    title: "Run studies",
    text: "Switch N-WAVE's aids on and off, and record what happens for bug reports and usability tests.",
    wiki: "Settings",
  },
  {
    title: "Bring your Nextflow in",
    text: "Import scripts and whole projects, nf-core style pipelines with their if / else branches too, and export them again unchanged.",
    wiki: "Importing-Workflows",
  },
  {
    title: "See a workflow's structure",
    text: "Check its code with nextflow lint and BioFlow-Insight, read its specification and process dependency graphs, and group steps into subworkflows.",
    wiki: "Workflow-Analysis",
  },
  {
    title: "Take it anywhere",
    text: "Export a runnable Nextflow project that works without N-WAVE, a diagram, or a language-neutral DAW model.",
    wiki: "Exporting-Projects",
  },
];

/** Every release in order, the released ones first. */
export const RELEASES: RoadmapRelease[] = [
  {
    version: "1.1",
    name: "Compatibility and documentation",
    status: "released",
    milestone: 1,
    goal: "Easy setup on common systems, automatic deployment of the demo, and the documentation in the wiki.",
    summary: "Easy setup, the demo online, and the wiki.",
    features: [],
  },
  {
    version: "1.1.1",
    name: "The Hands-On Update",
    status: "released",
    milestone: 2,
    goal: "A tutorial, a demo workflow and the user guide inside the app.",
    summary: "A tutorial, a demo workflow and the user guide in the app.",
    features: [],
  },
  {
    version: "1.2",
    name: "The Software Engineering Update",
    status: "released",
    milestone: 6,
    goal: "Tests, linting, accessibility, error handling and published Docker images.",
    summary: "Tests, linting, accessibility and Docker images.",
    features: [],
  },
  {
    version: "1.3",
    name: "The Node Update",
    status: "released",
    milestone: 3,
    goal: "nf-core modules, subworkflows and pipelines, custom nodes, node packs and project export.",
    summary: "nf-core modules, subworkflows and pipelines, and your own nodes.",
    features: [],
  },
  {
    version: "1.4",
    name: "Solid Ground",
    status: "released",
    milestone: 7,
    goal: "Safe to run, easier to change and easier for newcomers: workflow checks, explained errors, resume and clusters.",
    summary: "Workflow checks, explained errors, resume and clusters.",
    features: [],
  },
  {
    version: "1.5",
    name: "Study Ready",
    status: "released",
    milestone: 8,
    goal: "Switch N-WAVE's help features on and off, record what happens for debugging and usability tests, keep an overview of large workflows, and see what each failure explanation is based on.",
    summary: "Feature switches, verbose mode, nested views and failure evidence.",
    why: "So we can learn which of N-WAVE's aids actually help, and so large workflows stay readable.",
    features: [
      { title: "This roadmap page", issue: 203, status: "released" },
      { title: "Feature switches in Global Settings", issue: 190, status: "released" },
      { title: "Verbose mode: log and export what happens in N-WAVE", issue: 191, status: "released" },
      { title: "Minimap, nested views and run progress by stage", issue: 192, status: "released" },
      { title: "Failure explanations show their evidence and certainty", issue: 193, status: "released" },
    ],
  },
  {
    version: "1.6",
    name: "Import/Export",
    status: "released",
    milestone: 13,
    goal: "Bring existing Nextflow projects in, export without losing anything, and exchange workflows in a language-neutral format.",
    summary: "Import and export, workflow analysis, branches and courses.",
    why: "Your existing work shouldn't have to be rebuilt by hand.",
    features: [
      { title: "Cleaner exported Nextflow", issue: 40, status: "released" },
      { title: "Downloaded scripts import back into the same graph", issue: 171, status: "released" },
      { title: "Copy a subworkflow into a new, editable workflow", issue: 209, status: "released" },
      { title: "Workflow analysis with BioFlow-Insight, on your own machine", issue: 19, status: "released" },
      { title: "Analyse a workflow: check its code and see its structure", issue: 218, status: "released" },
      { title: "Canvas views: steps only, and connections made in code", issue: 219, status: "released" },
      { title: "When a step runs: its conditions, and a preview by parameter values", issue: 220, status: "released" },
      { title: "Group steps into a subworkflow", issue: 221, status: "released" },
      { title: "Export and import through the FONDA workflow metamodel", issue: 194, status: "released" },
      { title: "Courses for every major feature", issue: 241, status: "released" },
      { title: "Tested on a local installation before the release", issue: 224, status: "released" },
    ],
  },
  {
    version: "1.7",
    name: "Run Insight",
    status: "in-progress",
    milestone: 9,
    goal: "See how each step reads and writes data, what limited a run, and what would make it faster.",
    why: "Long runs become explainable, and you can try settings before you spend hours.",
    features: [
      { title: "I/O monitoring of each step", issue: 102 },
      { title: "Bottleneck analysis and runtime prediction with BottleMod", issue: 173 },
      { title: "A course for its features", issue: 251 },
      { title: "Tested on a local installation before the release", issue: 256 },
    ],
  },
  {
    version: "1.8",
    name: "AI Companion",
    status: "planned",
    milestone: 4,
    goal: "An assistant that explains workflows and failed runs and suggests checked changes, on a local model.",
    why: "Help in plain language, without sending your data away, and without changes you didn't approve.",
    features: [
      { title: "The AI companion", issue: 41 },
      { title: "A benchmark of nf-core tasks for models and prompts", issue: 195 },
      { title: "A course for its features", issue: 252 },
      { title: "Tested on a local installation before the release", issue: 257 },
    ],
  },
  {
    version: "1.9",
    name: "Interactive Workflows",
    status: "planned",
    milestone: 10,
    goal: "Steps that pause a run and ask you: review a report, pick a threshold, choose samples.",
    why: "Decide as results come in, instead of running everything and starting again.",
    features: [
      { title: "Interaction steps: a run waits for your decision", issue: 196 },
      { title: "nf-interact: interactions as a Nextflow plugin", issue: 201 },
      { title: "A course for its features", issue: 253 },
    ],
  },
  {
    version: "1.10",
    name: "State-Dependent Interactions",
    status: "planned",
    milestone: 11,
    goal: "Questions appear only once the data they need exists, and expire when they no longer make sense.",
    why: "The right question at the right moment.",
    features: [
      { title: "Rules for when an interaction is available", issue: 197 },
    ],
  },
  {
    version: "2.0",
    name: "Shared and Beyond Bioinformatics",
    status: "planned",
    milestone: 12,
    goal: "Accounts and safe shared installations, workflows outside bioinformatics, and an archived, citable release.",
    why: "N-WAVE for a whole lab or course, and for more fields of science.",
    features: [
      { title: "Logins, per-user data and sandboxed runs", issue: 27 },
      { title: "A node library and example outside nf-core", issue: 198 },
      { title: "An API for interaction steps in other workflow systems", issue: 199 },
      { title: "Run N-WAVE on shared research infrastructure", issue: 200 },
      { title: "An archived, citable release", issue: 202 },
    ],
  },
];

export const issueUrl = (issue: number): string => `${REPOSITORY_URL}/issues/${issue}`;
export const milestoneUrl = (milestone: number): string => `${REPOSITORY_URL}/milestone/${milestone}`;
export const MILESTONES_URL = `${REPOSITORY_URL}/milestones`;
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;
export const NEW_ISSUE_URL = `${REPOSITORY_URL}/issues/new/choose`;
export const CONTRIBUTING_URL = `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`;

/** A feature's status: its own, else planned in a release in progress, else its release's. */
export const featureStatus = (feature: RoadmapFeature, release: RoadmapRelease): RoadmapStatus =>
  feature.status ?? (release.status === "in-progress" ? "planned" : release.status);

/** "1.4" from "1.4.3". */
export const minorVersion = (version: string): string => version.split(".").slice(0, 2).join(".");

// The courses: short hands-on lessons, each a series of steps. The basics run
// in the browser (the demo too); the advanced ones need N-WAVE installed, as
// they run workflows and analyse them on its server. A step either explains
// (Next) or asks the user to do something, and goes on once it is done.

import type { Edge, Node } from "@xyflow/react";
import type React from "react";
import type { NodeData } from "../components/nodes/BaseNode";
import type { CourseStage } from "./courseStage";
import type { CourseId } from "./courseState";

/**
 * What a task step can see: the canvas (while a workflow is open), the open
 * panels, the workflow's runs and analysis, what was clicked since the step
 * began, and the page. A task may also read N-WAVE's own state (feature
 * switches, verbose mode, run defaults): tasks are checked again every moment.
 */
export interface CourseContext extends Pick<CourseStage, "run" | "analysis" | "view" | "nested" | "runProfile"> {
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** Nodes whose settings panel is open. */
  openPanels: string[];
  /** Names of the controls clicked since the step began (their labels). */
  clicked: ReadonlySet<string>;
  /** The page's path, e.g. `/settings` or `/workflow/…`. */
  path: string;
}

/** The page a step happens on; the card says where to go when the user is elsewhere. */
export type CoursePage = "workflow" | "home" | "settings";

export interface CourseStep {
  text: React.ReactNode;
  /** Where it happens (default: the workflow's canvas). */
  page?: CoursePage;
  /** What it is about (a CSS selector): outlined while the step shows. */
  target?: string;
  /** A task for the user: the course goes on once this holds. Without one: Next. */
  done?: (context: CourseContext) => boolean;
}

export interface CourseInfo {
  id: string;
  title: string;
  summary: string;
  /** About how long it takes. */
  minutes: number;
  level: "basics" | "advanced";
  /** What it teaches, in a few words each. */
  topics: string[];
  /** Placeholders of courses to come have none. */
  course?: CourseId;
  /** The course to take after this one. */
  next?: CourseId;
  /** A course to come: its issue. */
  issue?: number;
}

export const COURSES: CourseInfo[] = [
  {
    id: "home",
    course: "home",
    title: "The home page",
    summary:
      "What is where: the demos, your workflows, importing, help and settings. Ends with a workflow of your own, made from Demo 1.",
    minutes: 3,
    level: "basics",
    topics: ["Demos", "Your workflows", "New Workflow", "Help and settings"],
    next: "canvas",
  },
  {
    id: "canvas",
    course: "canvas",
    title: "The canvas",
    summary:
      "In your own copy of Demo 1: open a node's settings and change it, remove a node, add it back from the + menu and connect it.",
    minutes: 5,
    level: "basics",
    topics: ["Nodes and their settings", "Adding and connecting nodes", "The bottom bar"],
    next: "nfcore-modules",
  },
  {
    id: "nfcore-modules",
    course: "nfcore-modules",
    title: "Build with nf-core modules",
    summary:
      "A quality check of sequencing reads from scratch: a Samplesheet, FastQC and MultiQC from the nf-core Library, connected and exported.",
    minutes: 8,
    level: "basics",
    topics: ["Inputs", "The nf-core Library", "Connecting tools", "The workflow check", "Exporting"],
    next: "import-export",
  },
  {
    id: "import-export",
    course: "import-export",
    title: "Import and export",
    summary: "Take a workflow out as a script, a project or a DAW model, and bring Nextflow pipelines in.",
    minutes: 8,
    level: "basics",
    topics: ["Export", "Import", "Round trip", "DAW model"],
    next: "own-steps",
  },
  {
    id: "own-steps",
    course: "own-steps",
    title: "Your own steps",
    summary: "Write a custom process, read its code, and share your nodes as a node pack.",
    minutes: 8,
    level: "basics",
    topics: ["Custom processes", "The Code tab", "Node packs"],
    next: "large-workflows",
  },
  {
    id: "large-workflows",
    course: "large-workflows",
    title: "Large workflows",
    summary: "Find your way in a large workflow: the minimap, the steps inside a subworkflow, and groups.",
    minutes: 8,
    level: "basics",
    topics: ["Minimap", "Nested views", "Groups"],
    next: "studies",
  },
  {
    id: "studies",
    course: "studies",
    title: "N-WAVE for studies",
    summary: "Switch help features on and off, and record what happens in N-WAVE for a study.",
    minutes: 5,
    level: "basics",
    topics: ["Feature switches", "Verbose mode"],
  },
  {
    id: "run",
    course: "run",
    title: "Run a workflow",
    summary: "Run a workflow, follow it live, read its log and results, and find earlier runs.",
    minutes: 10,
    level: "advanced",
    topics: ["Running", "The run panel", "Results"],
    next: "failures",
  },
  {
    id: "failures",
    course: "failures",
    title: "When a run fails",
    summary: "Read a failure explanation and its evidence, fix the step, and resume the run.",
    minutes: 10,
    level: "advanced",
    topics: ["Failure explanations", "Resume", "The run cache"],
    next: "pipeline",
  },
  {
    id: "pipeline",
    course: "pipeline",
    title: "Run an nf-core pipeline",
    summary: "Run nf-core/rnaseq on its test data as one Pipeline node, then open its steps.",
    minutes: 15,
    level: "advanced",
    topics: ["Pipeline node", "Profiles", "Reports"],
    next: "clusters",
  },
  {
    id: "clusters",
    course: "clusters",
    title: "Run limits and clusters",
    summary: "Set how much a run may use, and run on a cluster through a run profile.",
    minutes: 8,
    level: "advanced",
    topics: ["Run limits", "Run profiles"],
    next: "structure",
  },
  {
    id: "structure",
    course: "structure",
    title: "Read a workflow's structure",
    summary:
      "Analyse a workflow's code, read its specification graph and process dependency graph, and see what a change affects.",
    minutes: 10,
    level: "advanced",
    topics: ["Analyse", "Specification graph", "Process dependency graph"],
  },
];

export const courseInfo = (course: CourseId): CourseInfo =>
  COURSES.find((entry) => entry.course === course) as CourseInfo;

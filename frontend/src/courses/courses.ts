// The courses: short hands-on lessons, each a series of steps. The basics run
// in the browser (the demo too); the advanced ones need N-WAVE installed, as
// they run workflows and analyse them on its server. A step either explains
// (Next) or asks the user to do something, and goes on once it is done.

import type { Edge, Node } from "@xyflow/react";
import type React from "react";
import type { NodeData } from "../components/nodes/BaseNode";
import type { CourseId } from "./courseState";

/** What a task step can see: the canvas, the open panels, what was clicked since the step began. */
export interface CourseContext {
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** Nodes whose settings panel is open. */
  openPanels: string[];
  /** Names of the controls clicked since the step began (their labels). */
  clicked: ReadonlySet<string>;
}

export interface CourseStep {
  text: React.ReactNode;
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
  },
  {
    id: "run",
    title: "Run a workflow",
    summary: "Run a workflow on real data, follow it live, read its log and results, and resume it after a fix.",
    minutes: 10,
    level: "advanced",
    topics: ["Running", "The run panel", "Results", "Resume"],
  },
  {
    id: "structure",
    title: "Read a workflow's structure",
    summary:
      "Analyse a workflow's code, read its specification graph and process dependency graph, and see what a change affects.",
    minutes: 8,
    level: "advanced",
    topics: ["Analyse", "Specification graph", "Process dependency graph"],
  },
  {
    id: "pipeline",
    title: "Run an nf-core pipeline",
    summary: "Run nf-core/rnaseq on its test data as one Pipeline node, then open its steps.",
    minutes: 15,
    level: "advanced",
    topics: ["Pipeline node", "Profiles", "Reports"],
  },
  {
    id: "own-code",
    title: "Bring your own code",
    summary: "Import a Nextflow script, write a custom process, and group steps into a subworkflow.",
    minutes: 12,
    level: "advanced",
    topics: ["Import", "Custom steps", "Groups"],
  },
];

export const courseInfo = (course: CourseId): CourseInfo =>
  COURSES.find((entry) => entry.course === course) as CourseInfo;

// What a course's tasks can see of the workflow page, published by it
// (WorkflowPage) while it is open: its nodes and connections, the open
// panels, the view, its runs and its analysis. The course runs at the app
// level (CourseRunner), across pages, so it reads them from here.

import type { Edge, Node } from "@xyflow/react";
import type { CanvasView } from "../canvas/canvasViews";
import type { NodeData } from "../components/nodes/BaseNode";
import type { NodeRunSummary } from "../execution/nodeRuns";

/** The workflow's runs, as the page shows them. */
export interface CourseRun {
  running: boolean;
  /** The last run the page shows (null before one). */
  runId: string | null;
  /** What each node did in that run. */
  steps: Record<string, NodeRunSummary["status"]>;
  /** A failure explanation shows next to the log. */
  explained: boolean;
  /** The run panel is open (not the small Runs bar). */
  panelOpen: boolean;
}

export interface CourseStage {
  nodes: Node<NodeData>[];
  edges: Edge[];
  openPanels: string[];
  /** The canvas shows the editor (not a graph view): a course card may sit at its top left. */
  editor: boolean;
  /** The open workflow's path, to come back to it from another page. */
  path: string | null;
  run: CourseRun;
  /** An analysis of the workflow as it is now, if there is one: its problems. */
  analysis: { problems: number } | null;
  view: CanvasView;
  /** The node whose steps are shown (nested view), if any. */
  nested: string | null;
  /** The run profile the workflow runs through, if any. */
  runProfile: string | null;
}

export const NO_RUN: CourseRun = { running: false, runId: null, steps: {}, explained: false, panelOpen: false };

const EMPTY: CourseStage = {
  nodes: [],
  edges: [],
  openPanels: [],
  editor: true,
  path: null,
  run: NO_RUN,
  analysis: null,
  view: "editor",
  nested: null,
  runProfile: null,
};

let stage = EMPTY;
const listeners = new Set<() => void>();

export const courseStage = (): CourseStage => stage;

export const subscribeCourseStage = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The workflow page publishes what it shows (and `null` when it closes; its path is kept). */
export const publishCourseStage = (next: (Partial<CourseStage> & { path: string }) | null): void => {
  stage = next ? { ...EMPTY, ...next } : { ...EMPTY, path: stage.path };
  for (const listener of listeners) listener();
};

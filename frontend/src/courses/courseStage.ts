// What a course's tasks can see of the canvas, published by the workflow
// page (WorkflowPage) while it is open: its nodes and connections, the open
// panels, the view. The course runs at the app level (CourseRunner), across
// pages, so it reads them from here.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";

export interface CourseStage {
  nodes: Node<NodeData>[];
  edges: Edge[];
  openPanels: string[];
  /** The canvas shows the editor (not a graph view): a course card may sit at its top left. */
  editor: boolean;
  /** The open workflow's path, to come back to it from another page. */
  path: string | null;
}

const EMPTY: CourseStage = {
  nodes: [],
  edges: [],
  openPanels: [],
  editor: true,
  path: null,
};

let stage = EMPTY;
const listeners = new Set<() => void>();

export const courseStage = (): CourseStage => stage;

export const subscribeCourseStage = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The workflow page publishes its canvas (and `null` when it closes; its path is kept). */
export const publishCourseStage = (next: (Omit<CourseStage, "path"> & { path: string }) | null): void => {
  stage = next ? next : { ...EMPTY, path: stage.path };
  for (const listener of listeners) listener();
};

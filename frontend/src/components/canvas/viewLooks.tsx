// What the views other than the editor say about themselves, in their title
// block: what they show, how that helps, and that N-WAVE draws them from the
// canvas (the analysis, BioFlow-Insight's reading of the code, is Analyse).

import type { CanvasView } from "../../canvas/canvasViews";
import type { CanvasViewLook } from "./Canvas";
import { VIEW_LABELS } from "./CanvasViewSwitch";

export const viewLook = (view: CanvasView, onBack: () => void): CanvasViewLook | undefined => {
  if (view === "steps") {
    return {
      title: VIEW_LABELS.steps,
      subtitle: "Read-only view",
      style: "blueprint",
      help: "Only the steps, and how data flows from one to the next: the channel code between them is hidden, its connections drawn as dotted lines through it. N-WAVE draws it from the canvas, to follow a long workflow at a glance.",
      onBack,
    };
  }
  if (view === "grouped") {
    return {
      title: VIEW_LABELS.grouped,
      subtitle: "Each group of steps as one box",
      style: "tinted",
      help: "The workflow's parts at a glance, as its subworkflows are in the code. Move a box to move its steps; click a group's name to rename or ungroup it; Open shows its steps. Analyse suggests groups too.",
      onBack,
    };
  }
  return undefined;
};

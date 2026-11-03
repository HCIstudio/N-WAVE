// Code the canvas can't show as steps (functions, plugin includes, the
// output block, a workflow's publish: section, ...) is kept as written in a
// code node with a placement: where in the script it goes. Import makes
// these nodes, export writes their code back in place.

export type CodePlacement = "script" | "end" | "publish" | "onComplete" | "onError";

export const CODE_PLACEMENTS: Record<CodePlacement, { key: string; label: string; where: string }> = {
  script: { key: "script_code", label: "Script code", where: "at the top of the script, before the processes" },
  end: { key: "end_code", label: "Code after the workflow", where: "after the workflow block" },
  publish: { key: "publish", label: "Published outputs", where: "in the workflow's publish: section" },
  onComplete: { key: "on_complete", label: "When the run completes", where: "in the workflow's onComplete: section" },
  onError: { key: "on_error", label: "When the run fails", where: "in the workflow's onError: section" },
};

export const placementOf = (data: Record<string, unknown>): CodePlacement | null =>
  typeof data.placement === "string" && data.placement in CODE_PLACEMENTS ? (data.placement as CodePlacement) : null;

import type { NodeData } from "../components/nodes/BaseNode";

const isEqualValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  // Node data is plain JSON (it is persisted as such), so a structural
  // comparison through JSON is exact enough and cheap relative to a render.
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * True when applying `patch` to `data` would not change anything.
 *
 * Operator nodes write their computed output back into node data whenever
 * their inputs are recomputed. Without this check every write produced a new
 * `nodes` array, which recomputed the inputs again and re-rendered the editor
 * in a tight loop.
 */
export const isNodeDataPatchNoop = (
  data: NodeData,
  patch: Partial<NodeData>
): boolean =>
  Object.entries(patch).every(([key, value]) => isEqualValue(data[key], value));

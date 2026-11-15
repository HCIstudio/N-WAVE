// How a panel saves its node's settings. A change the panel works out by
// itself when it opens (a summary for the node's subtitle, a default it
// fills in) is `derived`: it isn't the user's edit, so on a read-only
// example it is left out instead of asking for a copy, and during a run it
// waits.

import type { NodeData } from "../../nodes/BaseNode";

export interface SaveOptions {
  /** Worked out by the panel, not typed by the user. */
  derived?: boolean;
}

export type SaveNodeData = (nodeId: string, data: Partial<NodeData>, options?: SaveOptions) => void;

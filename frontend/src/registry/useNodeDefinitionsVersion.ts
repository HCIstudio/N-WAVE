import { useSyncExternalStore } from "react";
import {
  getNodeDefinitionsVersion,
  subscribeNodeDefinitions,
} from "./nodeDefinitions";

/**
 * The registry's version, so a component re-renders (and memos recompute)
 * when installed nf-core modules or custom nodes are registered after it
 * first looked a node up, e.g. right after a page reload.
 */
export const useNodeDefinitionsVersion = (): number =>
  useSyncExternalStore(subscribeNodeDefinitions, getNodeDefinitionsVersion);

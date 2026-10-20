import { createContext, useContext } from "react";
import type { ConnectionHint } from "../registry/portTypes";

/** Connections whose ports don't fit, by edge id. */
export const ConnectionHintsContext = createContext<Record<string, ConnectionHint>>({});

/** Why this connection's ports don't fit, if they don't. */
export const useConnectionHint = (edgeId: string): ConnectionHint | undefined =>
  useContext(ConnectionHintsContext)[edgeId];

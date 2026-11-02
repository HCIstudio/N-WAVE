import { createContext, useContext } from "react";

/** Opens the nested view of a canvas node (its steps inside); none outside the workflow page. */
export const NestedViewContext = createContext<((nodeId: string) => void) | null>(null);

export const useOpenNestedView = () => useContext(NestedViewContext);

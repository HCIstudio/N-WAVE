// The node panels opened by double-clicking nodes: which are open, which is
// in front, and which node is highlighted for the panel under the pointer.

import { useCallback, useState } from "react";

export const useNodePanels = () => {
  // Open panels, in the order they were opened.
  const [openIds, setOpenIds] = useState<string[]>([]);
  // Stacking order: the last one is in front.
  const [stackOrder, setStackOrder] = useState<string[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [recenterRequest, setRecenterRequest] = useState<{
    panelId: string;
    timestamp: number;
  } | null>(null);

  const bringToFront = useCallback((panelId: string) => {
    setStackOrder((order) => [...order.filter((id) => id !== panelId), panelId]);
  }, []);

  /** Open a node's panel, or bring it back into view when it is open. */
  const open = useCallback(
    (nodeId: string) => {
      setOpenIds((ids) => (ids.includes(nodeId) ? ids : [...ids, nodeId]));
      if (stackOrder.includes(nodeId)) {
        setRecenterRequest({ panelId: nodeId, timestamp: Date.now() });
      }
      bringToFront(nodeId);
      setHighlightedId(nodeId);
    },
    [stackOrder, bringToFront],
  );

  const close = useCallback((panelId: string) => {
    setOpenIds((ids) => ids.filter((id) => id !== panelId));
    setHighlightedId(null);
  }, []);

  return {
    openIds,
    highlightedId,
    setHighlightedId,
    bringToFront,
    open,
    close,
    /** Higher for panels further in front. */
    zIndexOf: (panelId: string) => (stackOrder.indexOf(panelId) + 1) * 10,
    isInStack: (panelId: string) => stackOrder.includes(panelId),
    recenterTriggerOf: (panelId: string) =>
      recenterRequest?.panelId === panelId
        ? recenterRequest.timestamp
        : undefined,
  };
};

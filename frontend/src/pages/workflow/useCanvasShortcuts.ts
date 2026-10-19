// Keyboard shortcuts on the canvas (undo and redo live in useCanvasHistory):
// copy, cut, paste and duplicate nodes, select all, save, run, fit view and
// the shortcuts overview. They don't fire while typing in a field or while a
// dialog is open. Copying works everywhere; changing the canvas waits for a
// run to finish and isn't possible on a read-only example.

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import type { NodeData } from "../../components/nodes/BaseNode";
import type { ToastType } from "../../components/common";
import { copySelection, pasteContent, readClipboard, writeClipboard } from "./clipboard";
import { hydrateEdges } from "./workflowDocument";

export const READ_ONLY_EDIT_MESSAGE =
  "This example is read-only. Copy nodes from it, or make your own copy to change it (drag one of its nodes).";

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest("input, textarea, select, .cm-editor") !== null);

const dialogOpen = (): boolean =>
  document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]') !== null;

/** Text selected on the page (e.g. in the run log) is copied as text. */
const textSelected = (): boolean => (window.getSelection()?.toString() ?? "") !== "";

interface CanvasShortcutsOptions {
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setIsDirty: (dirty: boolean) => void;
  /** False while the workflow loads. */
  enabled: boolean;
  readOnly: boolean;
  /** True (after telling the user) when a run locks the workflow. */
  blockedByRun: () => boolean;
  showToast: (message: string, type: ToastType) => void;
  onSave: () => void;
  onRun: () => void;
  onFitView: () => void;
  onShowShortcuts: () => void;
}

export const useCanvasShortcuts = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  setIsDirty,
  enabled,
  readOnly,
  blockedByRun,
  showToast,
  onSave,
  onRun,
  onFitView,
  onShowShortcuts,
}: CanvasShortcutsOptions) => {
  /** Whether the canvas may change now; says why not when it may not. */
  const canChange = useCallback(() => {
    if (blockedByRun()) return false;
    if (readOnly) {
      showToast(READ_ONLY_EDIT_MESSAGE, "info");
      return false;
    }
    return true;
  }, [blockedByRun, readOnly, showToast]);

  const removeEdge = useCallback(
    (edgeId: string) => setEdges((current) => current.filter((edge) => edge.id !== edgeId)),
    [setEdges],
  );

  /** Add the clipboard's (or the given) nodes, selected instead of the current ones. */
  const insert = useCallback(
    (content = readClipboard()) => {
      if (!content || content.nodes.length === 0) {
        showToast("Nothing to paste yet: select nodes and press Ctrl+C first.", "info");
        return;
      }
      if (!canChange()) return;
      const stamp = Date.now();
      const pasted = pasteContent(content, nodes, (index) => `node-${stamp}-${index}`);
      setNodes((current) =>
        current.map((node) => (node.selected ? { ...node, selected: false } : node)).concat(pasted.nodes),
      );
      setEdges((current) => current.concat(hydrateEdges(pasted.edges, pasted.nodes, removeEdge)));
      setIsDirty(true);
    },
    [nodes, canChange, setNodes, setEdges, setIsDirty, removeEdge, showToast],
  );

  const copy = useCallback(() => {
    const content = copySelection(nodes, edges);
    if (content) writeClipboard(content);
    return content;
  }, [nodes, edges]);

  const cut = useCallback(() => {
    if (!nodes.some((node) => node.selected) || !canChange()) return;
    copy();
    const removed = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    setNodes((current) => current.filter((node) => !removed.has(node.id)));
    setEdges((current) =>
      current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
    );
    setIsDirty(true);
  }, [nodes, copy, canChange, setNodes, setEdges, setIsDirty]);

  const duplicate = useCallback(() => {
    const content = copySelection(nodes, edges);
    if (content) insert(content);
  }, [nodes, edges, insert]);

  const selectAll = useCallback(
    () => setNodes((current) => current.map((node) => ({ ...node, selected: true }))),
    [setNodes],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextField(event.target) || dialogOpen()) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey) {
        // Ctrl+Z / Ctrl+Y belong to the history.
        const action = (
          {
            c: copy,
            x: cut,
            v: () => insert(),
            d: duplicate,
            a: selectAll,
            s: () => {
              if (!readOnly) onSave();
            },
            enter: onRun,
          } as Record<string, () => void>
        )[key];
        if (!action || event.shiftKey) return;
        if (
          (key === "c" || key === "x") &&
          (textSelected() || !nodes.some((node) => node.selected))
        ) {
          return;
        }
        event.preventDefault();
        action();
        return;
      }
      if (event.altKey || mod) return;
      if (event.key === "?") {
        event.preventDefault();
        onShowShortcuts();
      } else if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        onFitView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, nodes, copy, cut, insert, duplicate, selectAll, readOnly, onSave, onRun, onFitView, onShowShortcuts]);

  return { copy, cut, paste: insert, duplicate, selectAll };
};

import type React from "react";
import { Modal } from "../common/dialogs";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

/** The canvas shortcuts, in the order the overview shows them. */
export const SHORTCUTS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: "Edit",
    items: [
      [`${mod}+Z`, "Undo"],
      [`${mod}+Shift+Z or ${mod}+Y`, "Redo"],
      [`${mod}+C`, "Copy the selected nodes"],
      [`${mod}+X`, "Cut the selected nodes"],
      [`${mod}+V`, "Paste (also into another workflow)"],
      [`${mod}+D`, "Duplicate the selected nodes"],
      ["Delete or Backspace", "Delete the selected nodes or connections"],
    ],
  },
  {
    group: "Select and view",
    items: [
      [`${mod}+A`, "Select all nodes"],
      ["Shift+click or drag with Shift", "Select several nodes"],
      ["F", "Fit the workflow into view"],
    ],
  },
  {
    group: "Workflow",
    items: [
      [`${mod}+S`, "Save"],
      [`${mod}+Enter`, "Run"],
      ["?", "Show these shortcuts"],
    ],
  },
];

const ShortcutsDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
    <p className="text-sm text-text-light mb-3">
      They work on the canvas, not while you type in a field.
    </p>
    {SHORTCUTS.map(({ group, items }) => (
      <section key={group} className="mb-4 last:mb-0">
        <h3 className="text-sm font-semibold mb-1">{group}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {items.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="px-1.5 py-0.5 rounded border border-panel-border bg-background font-mono text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    ))}
  </Modal>
);

export default ShortcutsDialog;

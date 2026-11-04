// Naming a group of steps (#221), new or renamed: the name its subworkflow
// has in the code, checked as it is typed.

import type React from "react";
import { useEffect, useId, useState } from "react";
import { groupName } from "../../groups/groups";
import Modal from "../common/dialogs/Modal";

interface GroupDialogProps {
  isOpen: boolean;
  /** "Group" for new steps, "Rename" for a group. */
  mode: "group" | "rename";
  initialName: string;
  /** The steps it groups (labels). */
  steps: string[];
  /** Why the name (or the steps) can't be used, or null. */
  problemFor: (name: string) => string | null;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

const GroupDialog: React.FC<GroupDialogProps> = ({ isOpen, mode, initialName, steps, problemFor, onConfirm, onClose }) => {
  const inputId = useId();
  const [text, setText] = useState(initialName);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new dialog starts from its name.
  useEffect(() => setText(initialName), [isOpen, initialName]);
  const name = groupName(text);
  const problem = name ? problemFor(name) : "Give the group a name.";
  const confirm = () => {
    if (!problem) onConfirm(name);
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "group" ? "Group into a subworkflow" : "Rename the group"}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded border border-panel-border px-3 py-1.5 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={Boolean(problem)}
            className="rounded bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {mode === "group" ? "Group" : "Rename"}
          </button>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
        className="space-y-3 text-sm"
      >
        <p>
          {mode === "group"
            ? "These steps become one subworkflow in the code: what they read from the other steps becomes its inputs (take:), what the other steps read from them its outputs (emit:). Each step keeps its node and settings."
            : "The subworkflow's name in the code."}
        </p>
        <ul className="list-disc pl-5 text-text-light">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <div>
          <label htmlFor={inputId} className="mb-1 block font-medium">
            Name
          </label>
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-full rounded-md border border-accent bg-background p-2 text-sm text-text"
            // biome-ignore lint/a11y/noAutofocus: the dialog is for typing this name.
            autoFocus
          />
          {name && name !== text && (
            <p className="mt-1 text-xs text-text-light">
              In the code: <code>{name}</code>
            </p>
          )}
          {problem && (
            <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {problem}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default GroupDialog;

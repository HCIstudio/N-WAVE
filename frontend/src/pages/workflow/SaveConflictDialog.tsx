// Shown when a save was refused because the workflow was saved elsewhere
// meanwhile (another tab, or a custom node update). Nothing is overwritten
// until the user picks a version.

import type React from "react";
import { createPortal } from "react-dom";
import { Modal } from "../../components/common";

interface SaveConflictDialogProps {
  isOpen: boolean;
  workflowName: string;
  onReload: () => void;
  onSaveAsCopy: () => void;
  onOverwrite: () => void;
  /** Close and keep editing; nothing is saved until a version is picked. */
  onClose: () => void;
}

const SaveConflictDialog: React.FC<SaveConflictDialogProps> = ({
  isOpen,
  workflowName,
  onReload,
  onSaveAsCopy,
  onOverwrite,
  onClose,
}) => {
  const footer = (
    <div className="flex flex-wrap gap-2 justify-end">
      <button
        type="button"
        onClick={onOverwrite}
        className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-text"
      >
        Replace it with mine
      </button>
      <button
        type="button"
        onClick={onSaveAsCopy}
        className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-text"
      >
        Keep mine as a copy
      </button>
      <button
        type="button"
        onClick={onReload}
        className="px-4 py-2 rounded-md bg-nextflow-green hover:bg-nextflow-green-dark text-white"
      >
        Load the saved version
      </button>
    </div>
  );
  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="This workflow was changed elsewhere"
      footer={footer}
    >
      <div className="space-y-2 text-text">
        <p>
          “{workflowName}” was saved in another tab, or changed by a custom node
          update, after you opened it here. Your changes here aren't saved yet,
          so nothing was overwritten.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-text-light">
          <li>
            <strong>Load the saved version</strong> shows what was saved; your
            changes here are dropped.
          </li>
          <li>
            <strong>Keep mine as a copy</strong> saves your version as a new
            workflow and opens it; the saved one stays as it is.
          </li>
          <li>
            <strong>Replace it with mine</strong> saves your version over the
            other one.
          </li>
        </ul>
      </div>
    </Modal>,
    document.body,
  );
};

export default SaveConflictDialog;

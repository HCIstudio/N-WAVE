// Asks before a read-only workflow (an example) is copied for editing.

import type React from "react";
import { createPortal } from "react-dom";
import { Modal } from "../../components/common";

interface CopyPromptDialogProps {
  isOpen: boolean;
  workflowName: string;
  onCopy: () => void;
  onJustLook: () => void;
}

const CopyPromptDialog: React.FC<CopyPromptDialogProps> = ({
  isOpen,
  workflowName,
  onCopy,
  onJustLook,
}) => {
  const footer = (
    <div className="flex space-x-2">
      <button
        type="button"
        onClick={onJustLook}
        className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-text"
      >
        Just look
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="px-4 py-2 rounded-md bg-nextflow-green hover:bg-nextflow-green-dark text-white"
      >
        Make a copy
      </button>
    </div>
  );
  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onJustLook}
      title="Make your own copy to edit"
      footer={footer}
    >
      <div className="space-y-2 text-text">
        <p>
          “{workflowName}” is an example, so it can't be changed. You can
          change your own copy of it instead.
        </p>
        <p>
          The example stays as it is. Your copy is a workflow of your own: you
          can rename it, change it or delete it whenever you like.
        </p>
      </div>
    </Modal>,
    document.body,
  );
};

export default CopyPromptDialog;

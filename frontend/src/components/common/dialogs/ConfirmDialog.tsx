import Modal from "./Modal";
import type React from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: (e?: React.MouseEvent) => void;
  onConfirm: (e?: React.MouseEvent) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ConfirmDialogProps) => {
  // Wrap the onClose and onConfirm handlers with simpler versions
  const handleClose = (e?: React.MouseEvent) => {
    // Still stop propagation but don't prevent default
    if (e) {
      e.stopPropagation();
    }
    onClose(e);
  };

  const handleConfirm = (e?: React.MouseEvent) => {
    // Still stop propagation but don't prevent default
    if (e) {
      e.stopPropagation();
    }
    onConfirm(e);
  };

  const footer = (
    <div className="flex space-x-2">
      <button
        onClick={handleClose}
        className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-text"
      >
        {cancelText}
      </button>
      <button
        onClick={handleConfirm}
        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white"
      >
        {confirmText}
      </button>
    </div>
  );

  const content = (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} footer={footer}>
      <p className="text-text">{message}</p>
    </Modal>
  );

  // Use createPortal to render the dialog directly to the document body
  return createPortal(content, document.body);
};

export default ConfirmDialog;

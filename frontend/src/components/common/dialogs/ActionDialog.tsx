import Modal from "./Modal";
import type React from "react";
import { createPortal } from "react-dom";

export interface ActionButtonProps {
  text: string;
  onClick: (e?: React.MouseEvent) => void;
  className?: string;
  closeOnClick?: boolean;
}

interface ActionDialogProps {
  isOpen: boolean;
  onClose: (e?: React.MouseEvent) => void;
  title: string;
  message: string;
  actions: ActionButtonProps[];
}

const ActionDialog = ({
  isOpen,
  onClose,
  title,
  message,
  actions,
}: ActionDialogProps) => {
  const handleActionClick =
    (action: ActionButtonProps) => (e: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      action.onClick(e);
      if (action.closeOnClick) {
        onClose(e);
      }
    };

  const footer = (
    <div className="flex space-x-2">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={handleActionClick(action)}
          className={`px-4 py-2 rounded-md ${
            action.className || "bg-accent hover:bg-accent-hover text-text"
          }`}
        >
          {action.text}
        </button>
      ))}
    </div>
  );

  const content = (
    <Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
      <p className="text-text">{message}</p>
    </Modal>
  );

  return createPortal(content, document.body);
};

export default ActionDialog;

declare global {
  interface Window {
    __modalOpenCount?: number;
  }
}

{
  /*Resource Management Modal*/
}
import type React from "react";
import { useEffect, type FC, type PropsWithChildren } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
}

const Modal: FC<PropsWithChildren<ModalProps>> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"
      onClick={onClose}
    >
      <div
        className="bg-panel-background text-text rounded-lg shadow-xl w-1/2 max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-panel-border">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-light hover:text-text hover:bg-accent-hover rounded-md"
          >
            <X size={20} />
          </button>
        </header>
        <main className="p-4 overflow-auto flex-grow">{children}</main>
        {footer && (
          <footer className="flex justify-end p-4 border-t border-panel-border">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

export default Modal;

declare global {
  interface Window {
    __modalOpenCount?: number;
  }
}

// Resource Management Modal
import type React from "react";
import { useEffect, useId, useRef, type FC, type PropsWithChildren } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  /** A wider dialog, for content laid out in columns. */
  wide?: boolean;
}

const Modal: FC<PropsWithChildren<ModalProps>> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  wide = false,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Opened from the keyboard (e.g. a shortcut), focus starts in the dialog,
  // so Escape closes it; a field inside that took focus keeps it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.contains(document.activeElement)) {
      dialog.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    // Clicking the backdrop (but not the dialog) or pressing Escape closes.
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop click is a pointer shortcut for the dialog's own close button.
    <div
      className="fixed inset-0 bg-overlay z-40 flex justify-center items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <dialog
        ref={dialogRef}
        tabIndex={-1}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative bg-panel-background text-text rounded-lg shadow-xl w-full mx-4 flex flex-col ${wide ? "max-h-[90vh] max-w-4xl" : "max-w-lg"}`}
      >
        <header className="flex items-center justify-between p-4 border-b border-panel-border">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-text-light hover:text-text hover:bg-accent-hover rounded-md"
          >
            <X size={20} aria-hidden />
          </button>
        </header>
        <main className="p-4 overflow-auto flex-grow">{children}</main>
        {footer && (
          <footer className="flex justify-end p-4 border-t border-panel-border">
            {footer}
          </footer>
        )}
      </dialog>
    </div>
  );
};

export default Modal;

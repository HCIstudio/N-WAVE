// A floating, non-modal window: dragged by its header, resized by its corner
// (the size is kept per panel in localStorage), brought to the front when
// used. Node panels (PropertiesPanel) and the output and documentation
// panels open in one.

import { GripVertical, Trash2, X } from "lucide-react";
import type React from "react";
import { type FC, memo, type PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";

interface PanelProps {
  title: string;
  /** Keys the saved size. */
  panelId: string;
  onClose: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  style?: React.CSSProperties;
  /** Changes when the panel should move back to where it opened. */
  recenterTrigger?: number;
  initialSize?: { width: number; height: number };
  /** Where it opens: the middle of the window, or its right edge. */
  placement?: "center" | "right";
  closeOnEscape?: boolean;
  /** Children are the whole body (their own scrolling), not wrapped in a padded, scrolling one. */
  bare?: boolean;
}

const PANEL_HEADER_HEIGHT = 45;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 200;

const sizeKey = (panelId: string) => `panel-size-${panelId}`;

const savedSize = (panelId: string, fallback: { width: number; height: number }) => {
  try {
    const saved = localStorage.getItem(sizeKey(panelId));
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        width: Math.max(MIN_PANEL_WIDTH, parsed.width),
        height: Math.max(MIN_PANEL_HEIGHT, parsed.height),
      };
    }
  } catch (e) {
    console.error("Failed to parse panel size from localStorage", e);
  }
  return fallback;
};

const Panel: FC<PropsWithChildren<PanelProps>> = ({
  title,
  panelId,
  onClose,
  onDelete,
  deleteDisabled = false,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  style,
  recenterTrigger,
  initialSize = { width: 560, height: 400 },
  placement = "center",
  closeOnEscape = true,
  bare = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => savedSize(panelId, initialSize));
  const openingPosition = useCallback(
    (width: number) =>
      placement === "right" ? { x: window.innerWidth - width - 20, y: 20 } : { x: window.innerWidth * 0.5, y: 60 },
    [placement],
  );
  const [position, setPosition] = useState(() => openingPosition(size.width));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const animationFrameId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!closeOnEscape) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, closeOnEscape]);

  const onDragMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const panelWidth = panelRef.current?.offsetWidth || size.width;
        setPosition({
          x: Math.min(Math.max(0, e.clientX - dragStart.x), window.innerWidth - panelWidth),
          y: Math.min(Math.max(0, e.clientY - dragStart.y), window.innerHeight - PANEL_HEADER_HEIGHT),
        });
      } else if (isResizing) {
        setSize({
          width: Math.max(MIN_PANEL_WIDTH, size.width + (e.clientX - dragStart.x)),
          height: Math.max(MIN_PANEL_HEIGHT, size.height + (e.clientY - dragStart.y)),
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isDragging, isResizing, dragStart, size],
  );

  const onMouseUp = useCallback(() => {
    if (isResizing) {
      try {
        localStorage.setItem(sizeKey(panelId), JSON.stringify(size));
      } catch (e) {
        console.error("Failed to save panel size to localStorage", e);
      }
    }
    setIsDragging(false);
    setIsResizing(false);
  }, [isResizing, panelId, size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = requestAnimationFrame(() => onMouseMove(e));
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = isResizing ? "nwse-resize" : "grabbing";
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, isResizing, onMouseMove, onMouseUp]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new trigger moves the panel back, not a resize.
  useEffect(() => {
    if (recenterTrigger !== undefined) setPosition(openingPosition(size.width));
  }, [recenterTrigger, openingPosition]);

  return (
    <div
      ref={panelRef}
      // A floating, non-modal window.
      role="dialog"
      aria-label={title}
      className="fixed bg-panel-background rounded-lg shadow-2xl border border-panel-border z-30 text-text flex flex-col"
      style={{
        ...style,
        top: position.y,
        left: position.x,
        width: size.width,
        height: size.height,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Bring the panel to the front on pointer or keyboard interaction.
      onMouseDown={onFocus}
      onFocus={onFocus}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dragging the panel by its header is a pointer-only extra; the panel works where it opens. */}
      <div
        className="flex items-center justify-between p-2 border-b border-panel-border cursor-move"
        onMouseDown={onDragMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteDisabled}
              className="p-1 rounded-full hover:bg-gray-600 text-gray-400 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Delete Node"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-600" aria-label="Close Panel">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {bare ? children : <main className="p-4 overflow-auto flex-grow">{children}</main>}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: resizing by the corner is a pointer-only extra; the panel content scrolls at any size. */}
      <div
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize text-gray-500 hover:text-text"
        onMouseDown={onResizeMouseDown}
      >
        <svg width="100%" height="100%" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M10.53 10.53a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 1 1-1.06-1.06l4.24-4.24a.75.75 0 0 1 1.06 0zM11.59 5.34a.75.75 0 0 0 0-1.06l-4.24-4.24a.75.75 0 1 0-1.06 1.06l4.24 4.24a.75.75 0 0 0 1.06 0z" />
        </svg>
      </div>
    </div>
  );
};

export default memo(Panel);

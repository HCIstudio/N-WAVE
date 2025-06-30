import type React from "react";
import {
  type FC,
  type PropsWithChildren,
  useEffect,
  useState,
  useCallback,
  useRef,
  memo,
} from "react";
import { X, GripVertical, Trash2 } from "lucide-react";

interface PanelProps {
  title: string;
  onClose: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  style?: React.CSSProperties;
  recenterTrigger?: number;
  initialSize?: { width: number; height: number };
  panelId: string;
  onPositionChange: (x: number, y: number) => void;
  onResize: (x: number, y: number) => void;
}

const PANEL_HEADER_HEIGHT = 45;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 200;

const Panel: FC<PropsWithChildren<PanelProps>> = ({
  title,
  onClose,
  onDelete,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  style,
  recenterTrigger,
  initialSize = { width: 560, height: 400 },
  panelId,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    x: window.innerWidth * 0.5,
    y: 60,
  });

  const getInitialSize = () => {
    try {
      const savedSize = localStorage.getItem(`panel-size-${panelId}`);
      if (savedSize) {
        const parsedSize = JSON.parse(savedSize);
        return {
          width: Math.max(MIN_PANEL_WIDTH, parsedSize.width),
          height: Math.max(MIN_PANEL_HEIGHT, parsedSize.height),
        };
      }
    } catch (e) {
      console.error("Failed to parse panel size from localStorage", e);
    }
    return initialSize;
  };

  const [size, setSize] = useState(getInitialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const animationFrameId = useRef<number>();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        let newX = e.clientX - dragStart.x;
        let newY = e.clientY - dragStart.y;

        if (newX < 0) newX = 0;
        if (newX > window.innerWidth - panelWidth)
          newX = window.innerWidth - panelWidth;
        if (newY < 0) newY = 0;
        if (newY > window.innerHeight - PANEL_HEADER_HEIGHT)
          newY = window.innerHeight - PANEL_HEADER_HEIGHT;

        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          size.width + (e.clientX - dragStart.x)
        );
        const newHeight = Math.max(
          MIN_PANEL_HEIGHT,
          size.height + (e.clientY - dragStart.y)
        );
        setSize({ width: newWidth, height: newHeight });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isDragging, isResizing, dragStart, size]
  );

  const onMouseUp = useCallback(() => {
    if (isResizing) {
      try {
        localStorage.setItem(`panel-size-${panelId}`, JSON.stringify(size));
      } catch (e) {
        console.error("Failed to save panel size to localStorage", e);
      }
    }
    setIsDragging(false);
    setIsResizing(false);
  }, [isResizing, panelId, size]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      animationFrameId.current = requestAnimationFrame(() => {
        onMouseMove(e);
      });
    };

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = isResizing ? "nwse-resize" : "grabbing";
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, isResizing, onMouseMove, onMouseUp]);

  useEffect(() => {
    if (recenterTrigger !== undefined) {
      setPosition({ x: window.innerWidth * 0.5, y: 60 });
    }
  }, [recenterTrigger]);

  const headerClasses = `flex items-center justify-between p-2 border-b border-panel-border ${
    isDragging ? "cursor-move" : "cursor-move"
  }`;

  return (
    <div
      ref={panelRef}
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
      onClick={onFocus}
    >
      <div className={headerClasses} onMouseDown={onDragMouseDown}>
        <div className="flex items-center gap-2">
          <GripVertical className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded-full hover:bg-gray-600 text-gray-400 hover:text-red-400"
              aria-label="Delete Node"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-600"
            aria-label="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <main className="p-4 overflow-auto flex-grow">{children}</main>
      <div
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize text-gray-500 hover:text-text"
        onMouseDown={onResizeMouseDown}
      >
        <svg width="100%" height="100%" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.53 10.53a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 1 1-1.06-1.06l4.24-4.24a.75.75 0 0 1 1.06 0zM11.59 5.34a.75.75 0 0 0 0-1.06l-4.24-4.24a.75.75 0 1 0-1.06 1.06l4.24 4.24a.75.75 0 0 0 1.06 0z"></path>
        </svg>
      </div>
    </div>
  );
};

export default memo(Panel);

import type React from "react";
import { useState, useCallback, useEffect, useRef, memo } from "react";
import type { Node } from "reactflow";
import { GripVertical, Trash2, X } from "lucide-react";
import type { NodeData } from "../../nodes/BaseNode";
import ConfirmDialog from "../../common/dialogs/ConfirmDialog";
import OperatorNodePanel from "../operator/OperatorNodePanel";
import ProcessNodePanel from "../process/ProcessNodePanel";
import FileInputPanel from "../input/FileInputPanel";
import FastQCPanel from "../process/FastQCPanel";
import TrimmomaticPanel from "../process/TrimmomaticPanel";

interface PropertiesPanelProps {
  node: Node<NodeData>;
  onClose: () => void;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
  onDelete: (node: Node<NodeData>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  style?: React.CSSProperties;
  recenterTrigger?: number;
}

const PANEL_HEADER_HEIGHT = 45;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 200;

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  node,
  onClose,
  onSave,
  onDelete,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  style,
  recenterTrigger,
}) => {
  console.log("[PropertiesPanel] node prop:", node);
  const panelRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(node.data.label || "");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [position, setPosition] = useState({
    x: window.innerWidth - 580,
    y: 20,
  });

  const getInitialSize = () => {
    try {
      const savedSize = localStorage.getItem(`panel-size-${node.id}`);
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
    return { width: 560, height: 600 };
  };

  const [size, setSize] = useState(getInitialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setLabel(node.data.label || "");
  }, [node]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    onSave(node.id, { label: newLabel });
  };

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
        localStorage.setItem(`panel-size-${node.id}`, JSON.stringify(size));
      } catch (e) {
        console.error("Failed to save panel size to localStorage", e);
      }
    }
    setIsDragging(false);
    setIsResizing(false);
  }, [isResizing, node.id, size]);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    } else {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, isResizing, onMouseMove, onMouseUp]);

  useEffect(() => {
    if (recenterTrigger !== undefined) {
      setPosition({ x: window.innerWidth - size.width - 20, y: 20 });
    }
  }, [recenterTrigger, size.width]);

  const handleDeleteClick = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    onDelete(node);
    setIsConfirmOpen(false);
    onClose();
  };

  const headerClasses = `flex items-center justify-between p-2 border-b border-panel-border ${
    isDragging ? "cursor-move" : "cursor-move"
  }`;

  const renderNodeSpecificFields = () => {
    console.log(
      "[PropertiesPanel] node.type:",
      node.type,
      "node.data.processType:",
      node.data.processType
    );
    switch (node.type) {
      case "process":
        // Check if this is a specific process type (like FastQC or Trimmomatic)
        if (node.data.processType === "fastqc") {
          console.log("[PropertiesPanel] Rendering FastQCPanel");
          return <FastQCPanel node={node} onSave={onSave} />;
        }
        if (node.data.processType === "trimmomatic") {
          console.log("[PropertiesPanel] Rendering TrimmomaticPanel");
          return <TrimmomaticPanel node={node} onSave={onSave} />;
        }
        console.log(
          "[PropertiesPanel] Rendering ProcessNodePanel (generic process)"
        );
        return <ProcessNodePanel node={node} onSave={onSave} />;
      case "operator":
      case "filter":
        console.log("[PropertiesPanel] Rendering OperatorNodePanel");
        return <OperatorNodePanel node={node} onSave={onSave} />;
      case "fileInput":
        console.log("[PropertiesPanel] Rendering FileInputPanel");
        return <FileInputPanel node={node} onSave={onSave} />;
      default:
        console.log(
          "[PropertiesPanel] No properties available for this node type:",
          node.type
        );
        return (
          <p className="text-sm text-text-light text-center py-4">
            No properties available for this node type.
          </p>
        );
    }
  };

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
            {node.data.label || "Properties"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDeleteClick}
            className="p-1 rounded-full hover:bg-gray-600 text-gray-400 hover:text-red-400"
            aria-label="Delete Node"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-600"
            aria-label="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 overflow-auto flex-grow">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="node-label"
              className="block text-sm font-medium text-text-light mb-1"
            >
              Label
            </label>
            <input
              id="node-label"
              type="text"
              value={label}
              onChange={handleLabelChange}
              className="w-full rounded-md border-accent bg-background text-text shadow-sm p-2 focus:border-nextflow-green focus:ring-nextflow-green"
              placeholder="Enter node label..."
            />
          </div>

          <hr className="border-accent" />

          {renderNodeSpecificFields()}
        </div>
      </div>
      <div
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize text-gray-500 hover:text-text"
        onMouseDown={onResizeMouseDown}
      >
        <svg width="100%" height="100%" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.53 10.53a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 1 1-1.06-1.06l4.24-4.24a.75.75 0 0 1 1.06 0zM11.59 5.34a.75.75 0 0 0 0-1.06l-4.24-4.24a.75.75 0 1 0-1.06 1.06l4.24 4.24a.75.75 0 0 0 1.06 0z"></path>
        </svg>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Node"
        message={`Are you sure you want to delete the node "${
          node.data.label || "Unnamed Node"
        }"? This action cannot be undone.`}
      />
    </div>
  );
};

export default memo(PropertiesPanel);

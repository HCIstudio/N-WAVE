import type React from "react";
import { useState, useCallback, useEffect, useRef, memo } from "react";
import type { Node } from "@xyflow/react";
import { GripVertical, Trash2, X } from "lucide-react";
import type { NodeData, PortData } from "../../nodes/BaseNode";
import ConfirmDialog from "../../common/dialogs/ConfirmDialog";
import OperatorNodePanel from "../operator/OperatorNodePanel";
import { getNodeDefinitionForNode } from "../../../registry";
import NodeCodeView from "./NodeCodeView";
import NodeRunResults from "./NodeRunResults";
import NfCoreModuleDocs from "../process/NfCoreModuleDocs";
import { useNodeRun } from "../../../execution/RunTasksContext";
import { useFeature } from "../../../settings/useFeatures";

type PanelTab = "settings" | "code" | "results";

const PANEL_TABS: [PanelTab, string][] = [
  ["settings", "Settings"],
  ["code", "Code"],
  ["results", "Results"],
];

interface PropertiesPanelProps {
  node: Node<NodeData>;
  /** True while the workflow runs: settings are shown but can't change. */
  locked?: boolean;
  onClose: () => void;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
  onDelete: (node: Node<NodeData>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  style?: React.CSSProperties;
  recenterTrigger?: number;
  onConvertToCustom?: (
    node: Node<NodeData>,
    moduleSource?: string
  ) => Promise<void>;
  onEditCustomNode?: (customNodeId: string) => void;
}

const PANEL_HEADER_HEIGHT = 45;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 200;

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  node,
  locked = false,
  onClose,
  onSave,
  onDelete,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  style,
  recenterTrigger,
  onConvertToCustom,
  onEditCustomNode,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(node.data.label || "");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [chosenTab, setActiveTab] = useState<PanelTab>("settings");
  // Global Settings → Features: without custom code, no Code tab.
  const codeOn = useFeature("customCode");
  const tabs = PANEL_TABS.filter(([tab]) => codeOn || tab !== "code");
  const activeTab = chosenTab === "code" && !codeOn ? "settings" : chosenTab;
  const hasRun = Boolean(useNodeRun(node.id).summary);

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

  const definition = getNodeDefinitionForNode(node);
  const nfCoreModuleId =
    typeof node.data.nwaveNfCoreModuleId === "string"
      ? node.data.nwaveNfCoreModuleId
      : undefined;
  const ports = (key: "inputs" | "outputs"): PortData[] => {
    const fromData = node.data[key];
    return Array.isArray(fromData) && fromData.length > 0
      ? fromData
      : (definition?.[key] ?? []);
  };

  const renderNodeSpecificFields = () => {
    if (node.type === "operator" || node.type === "filter") {
      return <OperatorNodePanel node={node} onSave={onSave} />;
    }

    const PanelComponent = definition?.panel;
    if (PanelComponent) {
      return <PanelComponent node={node} onSave={onSave} />;
    }

    if (nfCoreModuleId) {
      return (
        <p className="rounded-md border border-amber-500/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">
          This nf-core component isn&apos;t installed on this server yet, so the
          node has no settings and adds nothing to the generated workflow.
          Install it with &quot;Install them&quot; in the banner above the
          canvas.
        </p>
      );
    }

    return (
      <p className="text-sm text-text-light text-center py-4">
        No properties available for this node type.
      </p>
    );
  };

  return (
    <div
      ref={panelRef}
      // A floating, non-modal window.
      role="dialog"
      aria-label={node.data.label || "Properties"}
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
      <div className={headerClasses} onMouseDown={onDragMouseDown}>
        <div className="flex items-center gap-2">
          <GripVertical className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            {node.data.label || "Properties"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={locked}
            className="p-1 rounded-full hover:bg-gray-600 text-gray-400 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Delete Node"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-600"
            aria-label="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Node panel views"
        className="flex gap-1 border-b border-panel-border px-2"
      >
        {tabs.map(([tab, title]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`node-panel-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`node-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const order = tabs.map(([name]) => name);
                const step = e.key === "ArrowRight" ? 1 : order.length - 1;
                const next =
                  order[(order.indexOf(tab) + step) % order.length] ?? "settings";
                setActiveTab(next);
                document.getElementById(`node-panel-tab-${next}`)?.focus();
              }
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              activeTab === tab
                ? "border-nextflow-green text-text"
                : "border-transparent text-text-light hover:text-text"
            }`}
          >
            {title}
            {tab === "results" && hasRun && (
              <span
                aria-hidden
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400 align-middle"
              />
            )}
          </button>
        ))}
      </div>

      {activeTab === "results" ? (
        <div
          id="node-panel-results"
          role="tabpanel"
          aria-labelledby="node-panel-tab-results"
          className="p-4 overflow-auto flex-grow"
        >
          <NodeRunResults nodeId={node.id} />
        </div>
      ) : activeTab === "code" ? (
        <div
          id="node-panel-code"
          role="tabpanel"
          aria-labelledby="node-panel-tab-code"
          className="p-4 overflow-auto flex-grow"
        >
          <NodeCodeView
            node={node}
            onConvertToCustom={onConvertToCustom}
            onEditCustomNode={onEditCustomNode}
          />
        </div>
      ) : (
        <div
          id="node-panel-settings"
          role="tabpanel"
          aria-labelledby="node-panel-tab-settings"
          className="p-4 overflow-auto flex-grow"
        >
          {locked && (
            <p className="mb-3 rounded-md border border-amber-500/60 bg-amber-100 px-3 py-2 text-sm text-amber-900">
              Locked while the workflow runs.
            </p>
          )}
          <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-70">
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

            {nfCoreModuleId && (
              <>
                <NfCoreModuleDocs
                  moduleId={nfCoreModuleId}
                  inputs={ports("inputs")}
                  outputs={ports("outputs")}
                />
                <hr className="border-accent" />
              </>
            )}

            {renderNodeSpecificFields()}
          </fieldset>
        </div>
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: resizing by the corner is a pointer-only extra; the panel content scrolls at any size. */}
      <div
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize text-gray-500 hover:text-text"
        onMouseDown={onResizeMouseDown}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10.53 10.53a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 1 1-1.06-1.06l4.24-4.24a.75.75 0 0 1 1.06 0zM11.59 5.34a.75.75 0 0 0 0-1.06l-4.24-4.24a.75.75 0 1 0-1.06 1.06l4.24 4.24a.75.75 0 0 0 1.06 0z" />
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

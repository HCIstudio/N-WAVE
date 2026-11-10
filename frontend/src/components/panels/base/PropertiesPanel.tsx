import type React from "react";
import { useState, useEffect, memo } from "react";
import { useNodeConditions } from "../../../execution/NodeConditionsContext";
import type { Node } from "@xyflow/react";
import type { NodeData, PortData } from "../../nodes/BaseNode";
import ConfirmDialog from "../../common/dialogs/ConfirmDialog";
import Panel from "../../common/ui/Panel";
import OperatorNodePanel from "../operator/OperatorNodePanel";
import { getNodeDefinitionForNode } from "../../../registry";
import { useNodeDefinitionsVersion } from "../../../registry/useNodeDefinitionsVersion";
import NodeCodeView from "./NodeCodeView";
import NodeRunResults from "./NodeRunResults";
import NfCoreModuleDocs from "../process/NfCoreModuleDocs";
import { useNodeRun } from "../../../execution/RunTasksContext";
import { useFeature } from "../../../settings/useFeatures";
import { logActivity } from "../../../activity/activityLog";

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
  // When it runs, from the analysis (#220).
  const conditions = useNodeConditions(node.id);
  const [label, setLabel] = useState(node.data.label || "");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [chosenTab, setActiveTab] = useState<PanelTab>("settings");
  // Global Settings → Features: without custom code, no Code tab.
  const codeOn = useFeature("customCode");
  const tabs = PANEL_TABS.filter(([tab]) => codeOn || tab !== "code");
  const activeTab = chosenTab === "code" && !codeOn ? "settings" : chosenTab;
  // Verbose mode: the Code tab opened.
  useEffect(() => {
    if (activeTab === "code") logActivity("code.opened", { nodeId: node.id });
  }, [activeTab, node.id]);
  const hasRun = Boolean(useNodeRun(node.id).summary);

  useEffect(() => {
    setLabel(node.data.label || "");
  }, [node]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    onSave(node.id, { label: newLabel });
  };

  const handleDeleteClick = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    onDelete(node);
    setIsConfirmOpen(false);
    onClose();
  };

  // Re-render when installed modules are registered after the panel opened,
  // so their settings replace the "not installed" note.
  useNodeDefinitionsVersion();
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
    <Panel
      title={node.data.label || "Properties"}
      panelId={node.id}
      onClose={onClose}
      onDelete={handleDeleteClick}
      deleteDisabled={locked}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      style={style}
      recenterTrigger={recenterTrigger}
      initialSize={{ width: 560, height: 600 }}
      placement="right"
      closeOnEscape={false}
      bare
    >
      {conditions && (
        <section aria-label="When it runs" className="border-b border-panel-border px-3 py-2 text-xs">
          <p className="font-medium">
            {conditions.runs === false
              ? "Won't run with these parameters. Runs when:"
              : "Runs when:"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {conditions.conditions.map((entry) => (
              <li key={entry.text} className="flex items-start gap-1.5">
                <span aria-hidden className="w-3 shrink-0 text-center">
                  {entry.holds === null ? "?" : entry.holds ? "✓" : "✗"}
                </span>
                <code className="break-all">{entry.text}</code>
                <span className="sr-only">
                  {entry.holds === null ? "(can't tell before the run)" : entry.holds ? "(holds)" : "(doesn't hold)"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-text-light">
            From the analysis (BioFlow-Insight), with the Parameters node&apos;s values.
          </p>
        </section>
      )}

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
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Node"
        message={`Are you sure you want to delete the node "${
          node.data.label || "Unnamed Node"
        }"? This action cannot be undone.`}
      />
    </Panel>
  );
};

export default memo(PropertiesPanel);

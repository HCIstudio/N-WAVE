import type React from "react";
import { useId } from "react";
import type { Node } from "reactflow";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import type { NfCoreSubworkflowTake } from "../../../registry/nfcore/subworkflow";
import type { NodeData } from "../../nodes/BaseNode";
import NfCoreValueInputs from "./NfCoreValueInputs";
import SaveOutputsToggle from "./SaveOutputsToggle";

interface NfCoreSubworkflowPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const fieldClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

/** Settings of an nf-core subworkflow node: its takes and process config. */
const NfCoreSubworkflowPanel: React.FC<NfCoreSubworkflowPanelProps> = ({
  node,
  onSave,
}) => {
  const fieldId = useId();
  const { edges } = useWorkflowContext();
  const takes: NfCoreSubworkflowTake[] = Array.isArray(
    node.data.nfcoreSubworkflowTakes,
  )
    ? node.data.nfcoreSubworkflowTakes
    : [];
  const components = node.data.nfcoreSubworkflowComponents as
    | { modules: string[]; subworkflows: string[] }
    | undefined;
  const values = (node.data.nfcoreValues ?? {}) as Record<
    string,
    string | number | boolean
  >;
  const setValue = (name: string, value: string) =>
    onSave(node.id, { nfcoreValues: { ...values, [name]: value } });
  const isConnected = (take: string) =>
    edges.some((edge) => edge.target === node.id && edge.targetHandle === take);
  const channelTakes = takes.filter((take) => take.kind === "channel");
  const valueTakes = takes.filter((take) => take.kind === "value");

  return (
    <div className="space-y-4">
      <SaveOutputsToggle node={node} onSave={onSave} />
      <div>
        <h3 className="text-lg font-semibold text-text">nf-core Subworkflow</h3>
        <p className="mt-1 text-sm text-text-light">
          {node.data.nwaveNfCoreModuleId || "Installed nf-core subworkflow"}
        </p>
      </div>

      {node.data.nwaveNfCoreOutdated && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-900/20 p-3 text-sm text-yellow-100">
          This subworkflow was installed from an older nf-core/modules version.
          Reinstall it from the nf-core Library to use its current inputs.
        </div>
      )}

      {channelTakes.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-text">
            Input channels
          </legend>
          <p className="text-xs text-text-light">
            Connect a channel of the shape the subworkflow expects. While an
            input isn&apos;t connected, the expression below is passed instead (
            <code>[]</code> means &quot;no file&quot; to nf-core modules).
          </p>
          {channelTakes.map((take) => {
            const id = `${fieldId}-${take.name}`;
            const connected = isConnected(take.name);
            return (
              <div key={take.name} className="space-y-1">
                <label htmlFor={id} className="block text-sm text-text">
                  <span className="font-mono">{take.name}</span>
                  <span className="ml-2 text-xs text-text-light">
                    {connected ? "connected" : "when not connected"}
                  </span>
                </label>
                <input
                  id={id}
                  value={String(values[take.name] ?? take.defaultValue)}
                  onChange={(event) => setValue(take.name, event.target.value)}
                  disabled={connected}
                  aria-describedby={`${id}-description`}
                  className={`${fieldClassName} font-mono disabled:opacity-50`}
                />
                <p id={`${id}-description`} className="text-xs text-text-light">
                  {take.description}
                </p>
              </div>
            );
          })}
        </fieldset>
      )}

      <NfCoreValueInputs
        inputs={valueTakes.map((take) => ({
          name: take.name,
          type: take.type,
          description: take.description,
          defaultValue: take.defaultValue,
        }))}
        values={values}
        onChange={(nfcoreValues) => onSave(node.id, { nfcoreValues })}
        legend="Values"
        hint="Values passed to the subworkflow's value inputs."
      />

      <div className="space-y-1 border-t border-accent pt-4">
        <label
          htmlFor={`${fieldId}-config`}
          className="block text-sm font-semibold text-text"
        >
          Process config
        </label>
        <p className="text-xs text-text-light">
          Selectors for the processes inside the subworkflow, added to the{" "}
          <code>process</code> config, e.g. extra arguments for one tool.
        </p>
        <textarea
          id={`${fieldId}-config`}
          value={String(node.data.nfcoreProcessConfig ?? "")}
          onChange={(event) =>
            onSave(node.id, { nfcoreProcessConfig: event.target.value })
          }
          rows={4}
          spellCheck={false}
          placeholder={
            "withName: '.*:SALMON_QUANT' {\n    ext.args = '--seqBias'\n}"
          }
          className={`${fieldClassName} font-mono text-xs`}
        />
      </div>

      {components && (
        <div className="space-y-1 border-t border-accent pt-4 text-xs text-text-light">
          <h4 className="text-sm font-semibold text-text">Includes</h4>
          {components.modules.length > 0 && (
            <p>
              Modules:{" "}
              <span className="font-mono">{components.modules.join(", ")}</span>
            </p>
          )}
          {components.subworkflows.length > 0 && (
            <p>
              Subworkflows:{" "}
              <span className="font-mono">
                {components.subworkflows.join(", ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default NfCoreSubworkflowPanel;

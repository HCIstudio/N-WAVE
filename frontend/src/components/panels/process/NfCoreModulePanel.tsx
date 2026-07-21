import React, { useState } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import { MemoryInput, TimeInput } from "../../common/forms";

interface NfCoreModulePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const NfCoreModulePanel: React.FC<NfCoreModulePanelProps> = ({
  node,
  onSave,
}) => {
  const supportsExtArgs = Boolean(node.data.nwaveNfCoreSupportsExtArgs);
  const supportsResources = node.data.nwaveNfCoreSupportsResources !== false;
  const extArgNames = Array.isArray(node.data.nwaveNfCoreExtArgNames)
    ? node.data.nwaveNfCoreExtArgNames
    : [];
  const argumentReferences = Array.isArray(
    node.data.nwaveNfCoreArgumentReferences
  )
    ? node.data.nwaveNfCoreArgumentReferences
    : [];
  const [extArgs, setExtArgs] = useState(node.data.nfcoreExtArgs ?? "");
  const [cpus, setCpus] = useState(node.data.cpus ?? 1);
  const [memory, setMemory] = useState(node.data.memory ?? "2.GB");
  const [timeLimit, setTimeLimit] = useState(node.data.timeLimit ?? "2.h");
  const [overrideResources, setOverrideResources] = useState(
    Boolean(node.data.overrideResources)
  );

  React.useEffect(() => {
    onSave(node.id, {
      nfcoreExtArgs: supportsExtArgs ? extArgs : undefined,
      overrideResources: supportsResources ? overrideResources : false,
      cpus: supportsResources && overrideResources ? cpus : undefined,
      memory: supportsResources && overrideResources ? memory : undefined,
      timeLimit:
        supportsResources && overrideResources ? timeLimit : undefined,
      subtitle: node.data.nwaveNfCoreNeedsReview
        ? "nf-core module - review adapter"
        : "nf-core module",
    });
  }, [
    cpus,
    extArgs,
    memory,
    node.data.nwaveNfCoreNeedsReview,
    node.id,
    onSave,
    overrideResources,
    supportsExtArgs,
    supportsResources,
    timeLimit,
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text">nf-core Settings</h3>
        <p className="mt-1 text-sm text-text-light">
          {node.data.nwaveNfCoreModuleId || "Installed nf-core module"}
        </p>
      </div>

      {node.data.nwaveNfCoreNeedsReview && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-900/20 p-3 text-sm text-yellow-100">
          This adapter was generated from module metadata and should be reviewed
          before production use.
        </div>
      )}

      {supportsExtArgs && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text mb-1">
            Extra arguments
          </label>
          {extArgNames.length > 0 && (
            <p className="text-xs text-text-light">
              Supported nf-core extension fields: {extArgNames.join(", ")}
            </p>
          )}
          <textarea
            value={extArgs}
            onChange={(event) => setExtArgs(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-accent bg-background p-2 font-mono text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green"
            placeholder="Arguments passed to task.ext.args"
          />
          {argumentReferences.length > 0 && (
            <div className="rounded-md border border-accent bg-background/60 p-2">
              <p className="text-xs font-medium text-text">
                Argument references
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {argumentReferences.map(
                  (reference: { type?: string; url?: string }) => (
                    <a
                      key={`${reference.type}-${reference.url}`}
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-accent px-2 py-1 text-xs text-nextflow-green hover:bg-accent"
                    >
                      {toReferenceLabel(reference.type)}
                    </a>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {supportsResources && (
        <div className="border-t border-accent pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text">Resources</h4>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={overrideResources}
                onChange={(event) => setOverrideResources(event.target.checked)}
                className="rounded border-accent"
              />
              Override defaults
            </label>
          </div>

          {overrideResources && (
            <div className="space-y-3">
              <div className="flex flex-row flex-wrap gap-2">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-sm font-medium text-text mb-1">
                    CPUs
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cpus}
                    onChange={(event) =>
                      setCpus(Number.parseInt(event.target.value) || 1)
                    }
                    className="w-full p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-sm font-medium text-text mb-1">
                    Memory
                  </label>
                  <MemoryInput value={memory} onChange={setMemory} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Time limit
                </label>
                <TimeInput value={timeLimit} onChange={setTimeLimit} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const toReferenceLabel = (type?: string): string => {
  if (type === "documentation") return "Documentation";
  if (type === "tool_dev_url") return "Source";
  if (type === "homepage") return "Homepage";
  return "Reference";
};

export default NfCoreModulePanel;

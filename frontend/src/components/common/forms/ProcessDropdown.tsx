import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { getNextflowProcesses } from "../../../data/nextflowProcesses";
import type { NextflowProcess } from "../../../data/types";
import type { StoredCustomNode } from "../../../registry/customNodes";
import { useInstalledNfCoreNodes } from "../../../hooks/nfcore/useInstalledNfCoreNodes";
import {
  migrateLegacyCustomNodes,
  refreshCustomNodes,
} from "../../../api/customNodes";
import CustomNodeModal from "./CustomNodeModal";
import DynamicIcon from "../ui/DynamicIcon";
import NfCoreLibraryModal from "./NfCoreLibraryModal";
import SearchInput from "./SearchInput";

interface ProcessDropdownProps {
  onSelectProcess: (process: NextflowProcess) => void;
  onClose: () => void;
  onCustomNodeSaved?: (node: StoredCustomNode) => void;
  onCustomNodeDeleteRequested?: (node: StoredCustomNode) => void;
}

const ProcessDropdown: React.FC<ProcessDropdownProps> = ({
  onSelectProcess,
  onCustomNodeSaved,
  onCustomNodeDeleteRequested,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [registryVersion, setRegistryVersion] = useState(0);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCustomNodeOpen, setIsCustomNodeOpen] = useState(false);
  const [editNode, setEditNode] = useState<StoredCustomNode | null>(null);
  const { error, isLoading, refresh } = useInstalledNfCoreNodes();

  useEffect(() => {
    refresh().finally(async () => {
      await migrateLegacyCustomNodes().catch(() => 0);
      await refreshCustomNodes().catch(() => 0);
      setRegistryVersion((version) => version + 1);
    });
  }, [refresh]);

  const filteredProcesses = useMemo(() => {
    const nextflowProcesses = getNextflowProcesses();

    if (!searchTerm) {
      return nextflowProcesses;
    }

    return nextflowProcesses
      .map((category) => {
        const processes = category.processes.filter(
          (process) =>
            process.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            process.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return { ...category, processes };
      })
      .filter((category) => category.processes.length > 0);
  }, [searchTerm, registryVersion]);

  return (
    <div className="absolute right-0 mt-2 w-80 bg-background border border-accent rounded-md shadow-lg z-20 flex flex-col">
      <div className="p-2 border-b border-accent">
        <SearchInput
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search nodes..."
        />
        <button
          type="button"
          onClick={() => setIsLibraryOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          <DynamicIcon name="PackagePlus" className="h-4 w-4" />
          nf-core Library
        </button>
        <button
          type="button"
          onClick={() => {
            setEditNode(null);
            setIsCustomNodeOpen(true);
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          <DynamicIcon name="FileCode" className="h-4 w-4" />
          Add Custom Node
        </button>
      </div>
      <div className="p-1 overflow-y-auto max-h-96">
        {isLoading && (
          <p className="px-3 py-2 text-xs text-text-light">
            Loading installed nf-core nodes...
          </p>
        )}
        {error && (
          <p className="px-3 py-2 text-xs text-red-600">
            Installed nf-core nodes unavailable.
          </p>
        )}
        {filteredProcesses.length > 0 ? (
          filteredProcesses.map((category) => (
            <div key={category.category}>
              <p className="px-3 py-2 text-xs font-semibold text-text-light tracking-wider uppercase">
                {category.category}
              </p>
              {category.processes.map((process: NextflowProcess) => (
                <div
                  key={process.type + process.label}
                  className="group flex items-center rounded-md hover:bg-accent"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProcess(process)}
                    className="flex min-w-0 flex-1 items-center px-3 py-2 text-left text-sm text-text"
                  >
                    <DynamicIcon name={process.icon} className="mr-3 h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{process.label}</p>
                      <p className="line-clamp-2 text-xs text-text-light">
                        {process.description}
                      </p>
                    </div>
                  </button>
                  {process.initialData?.customNodeId && (
                    <div className="mr-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditNode(
                            (process.initialData
                              ?.customNodeDefinition as StoredCustomNode) ??
                              null
                          );
                          setIsCustomNodeOpen(true);
                        }}
                        className="rounded-md p-2 text-text-light opacity-80 hover:bg-accent-hover hover:text-text group-hover:opacity-100"
                        title="Edit custom node"
                        aria-label={`Edit ${process.label}`}
                      >
                        <DynamicIcon name="Pencil" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const customNode = process.initialData
                            ?.customNodeDefinition as StoredCustomNode | undefined;
                          if (customNode) {
                            onCustomNodeDeleteRequested?.(customNode);
                          }
                        }}
                        className="rounded-md p-2 text-text-light opacity-80 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                        title="Delete custom node"
                        aria-label={`Delete ${process.label}`}
                      >
                        <DynamicIcon name="Trash2" className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-text-light p-4">
            No nodes found.
          </p>
        )}
      </div>
      <NfCoreLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onInstalled={() => {
          refreshCustomNodes().finally(() => {
            setRegistryVersion((version) => version + 1);
          });
        }}
      />
      <CustomNodeModal
        isOpen={isCustomNodeOpen}
        node={editNode}
        onClose={() => {
          setIsCustomNodeOpen(false);
          setEditNode(null);
        }}
        onSaved={(savedNode) => {
          onCustomNodeSaved?.(savedNode);
          refreshCustomNodes().finally(() => {
            setRegistryVersion((version) => version + 1);
          });
        }}
      />
    </div>
  );
};

export default ProcessDropdown;

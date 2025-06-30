import type React from "react";
import { useCallback } from "react";
import type { Node } from "reactflow";
import type { NodeData, FileObject } from "../../nodes/BaseNode";

import { SelectField, InputField, CheckboxField } from "../../common";
import BaseOperatorPanel, {
  type InjectedOperatorProps,
} from "./BaseOperatorPanel";

interface FilterPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const FilterPanelContent: React.FC<InjectedOperatorProps> = ({
  nodeData = {},
  handleDataChange = () => {},
  incomingFiles = [],
  node,
}) => {
  const {
    filterText = "",
    filterMode = "contains",
    filterNegate = false,
    selectedFilterFiles = [],
  } = nodeData;

  // Create unique IDs for this specific node to avoid conflicts
  const nodeId = node?.id || "unknown";
  const selectAllId = `selectAll-${nodeId}`;

  const handleFileSelectionChange = useCallback(
    (file: FileObject) => {
      const currentSelection = selectedFilterFiles || [];
      const isSelected = currentSelection.some(
        (f: FileObject) => f.name === file.name
      );

      const newSelection = isSelected
        ? currentSelection.filter((f: FileObject) => f.name !== file.name)
        : [...currentSelection, file];

      handleDataChange("selectedFilterFiles", newSelection);
    },
    [selectedFilterFiles, handleDataChange, nodeId]
  );

  const handleSelectAll = useCallback(
    (isChecked: boolean) => {
      handleDataChange("selectedFilterFiles", isChecked ? incomingFiles : []);
    },
    [incomingFiles, handleDataChange, nodeId]
  );

  // Simple file selection checking - match by name (this preserves selections across file re-uploads)
  const isFileSelected = useCallback(
    (file: FileObject) => {
      const selected = selectedFilterFiles.some(
        (f: FileObject) => f.name === file.name
      );
      return selected;
    },
    [selectedFilterFiles]
  );

  const areAllFilesSelected =
    incomingFiles.length > 0 &&
    incomingFiles.every((file) => isFileSelected(file));

  return (
    <>
      {/* Custom file selection for Filter */}
      <div className="space-y-2 mb-4">
        <h3 className="text-md font-semibold text-text border-b border-accent pb-2">
          File Selection
        </h3>
        {incomingFiles.length > 0 ? (
          <>
            <div className="flex items-center">
              <input
                type="checkbox"
                id={selectAllId}
                checked={areAllFilesSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-nextflow-green focus:ring-nextflow-green"
              />
              <label
                htmlFor={selectAllId}
                className="ml-2 block text-sm text-text"
              >
                {areAllFilesSelected ? "Deselect All" : "Select All"}
              </label>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
              {incomingFiles.map((file: FileObject) => {
                const fileCheckboxId = `file-${nodeId}-${file.name}`;
                return (
                  <div
                    key={`${nodeId}-${file.name}`}
                    className="flex items-center"
                  >
                    <input
                      type="checkbox"
                      id={fileCheckboxId}
                      checked={isFileSelected(file)}
                      onChange={() => handleFileSelectionChange(file)}
                      className="h-4 w-4 rounded border-gray-300 text-nextflow-green focus:ring-nextflow-green"
                    />
                    <label
                      htmlFor={fileCheckboxId}
                      className="ml-2 block text-sm text-text truncate"
                      title={file.name}
                    >
                      {file.name}
                    </label>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-text-light text-center py-2">
            No files received from parent node.
          </p>
        )}
      </div>

      {/* Filter configuration */}
      <InputField
        label="Filter Text"
        id={`filterText-${nodeId}`}
        name="filterText"
        value={filterText}
        onChange={(e) => handleDataChange("filterText", e.target.value)}
        placeholder="Enter text to filter by..."
      />

      <SelectField
        label="Filter Mode"
        id={`filterMode-${nodeId}`}
        name="filterMode"
        value={filterMode}
        onChange={(e) => handleDataChange("filterMode", e.target.value)}
      >
        <option value="contains">Contains</option>
        <option value="startsWith">Starts With</option>
        <option value="endsWith">Ends With</option>
        <option value="matches">Matches (Regex)</option>
      </SelectField>

      <CheckboxField
        label="Negate (exclude matches)"
        id={`filterNegate-${nodeId}`}
        name="filterNegate"
        checked={filterNegate}
        onChange={(e) => handleDataChange("filterNegate", e.target.checked)}
      />
    </>
  );
};

const FilterPanel: React.FC<FilterPanelProps> = ({ node, onSave }) => {
  return (
    <BaseOperatorPanel
      node={node}
      onSave={onSave}
      title="Filter"
      showFileSelection={false} // We handle file selection custom in FilterPanelContent
    >
      <FilterPanelContent key={node.id} />
    </BaseOperatorPanel>
  );
};

export default FilterPanel;

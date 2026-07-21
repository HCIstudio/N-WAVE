import type React from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import type { CustomNodeInput } from "../../../registry/customNodes";

interface CustomNodePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const CustomNodePanel: React.FC<CustomNodePanelProps> = ({ node, onSave }) => {
  const valueInputs = Array.isArray(node.data.customNodeValueInputs)
    ? (node.data.customNodeValueInputs as CustomNodeInput[])
    : [];
  const values = node.data.customNodeValues ?? {};

  const handleValueChange = (name: string, value: string) => {
    onSave(node.id, {
      customNodeValues: {
        ...values,
        [name]: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text">
          {node.data.label || "Custom Node"}
        </h3>
        <p className="mt-1 text-sm text-text-light">
          {node.data.customNodeId || "User-defined Nextflow process"}
        </p>
      </div>

      {valueInputs.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-text">Settings</h4>
          {valueInputs.map((input) => (
            <div key={input.name}>
              <label className="mb-1 block text-sm font-medium text-text">
                {input.label || input.name}
              </label>
              <CustomSettingControl
                input={input}
                value={String(values[input.name] ?? input.defaultValue ?? "")}
                onChange={(value) => handleValueChange(input.name, value)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-accent bg-background/60 p-3 text-sm text-text-light">
          This custom node only uses connected workflow inputs.
        </p>
      )}
    </div>
  );
};

const CustomSettingControl: React.FC<{
  input: CustomNodeInput;
  value: string;
  onChange: (value: string) => void;
}> = ({ input, value, onChange }) => {
  const className =
    "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

  if (input.settingType === "boolean") {
    return (
      <label className="flex items-center gap-2 rounded-md border border-accent bg-background p-2 text-sm text-text">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(event) => onChange(event.target.checked ? "true" : "false")}
          className="h-4 w-4"
        />
        Enabled
      </label>
    );
  }

  if (input.settingType === "select") {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        {(input.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={input.settingType === "integer" || input.settingType === "float" ? "number" : "text"}
      step={input.settingType === "integer" ? "1" : input.settingType === "float" ? "any" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
};

export default CustomNodePanel;

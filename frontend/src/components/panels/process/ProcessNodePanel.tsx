import type React from "react";
import type { Node } from "reactflow";
import { Plus, Trash2, Info } from "lucide-react";
import type { NodeData } from "../../nodes/BaseNode";

// We'll need to add these types to the main NodeData interface later
interface ProcessInput {
  id: string;
  name: string;
  type: "val" | "path";
  value: string;
}

interface ProcessNodePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const ProcessNodePanel: React.FC<ProcessNodePanelProps> = ({
  node,
  onSave,
}) => {
  // Casting here for now, should be integrated into NodeData properly
  const { processInputs = [] } = node.data as {
    processInputs?: ProcessInput[];
  };

  const handleAddInput = () => {
    const newInputs = [
      ...processInputs,
      {
        id: `input-${Date.now()}`,
        name: "",
        type: "val",
        value: "",
      },
    ];
    onSave(node.id, { processInputs: newInputs });
  };

  const handleInputChange = (
    id: string,
    field: keyof ProcessInput,
    value: string
  ) => {
    const newInputs = processInputs.map((input) =>
      input.id === id ? { ...input, [field]: value } : input
    );
    onSave(node.id, { processInputs: newInputs });
  };

  const handleRemoveInput = (id: string) => {
    const newInputs = processInputs.filter((input) => input.id !== id);
    onSave(node.id, { processInputs: newInputs });
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-md font-semibold text-text mb-2">Inputs</h4>
        <div className="space-y-2">
          {processInputs.map((input) => (
            <div key={input.id} className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="name"
                value={input.name}
                onChange={(e) =>
                  handleInputChange(input.id, "name", e.target.value)
                }
                className="flex-grow p-1 rounded-md bg-background-light border border-accent"
              />
              <select
                value={input.type}
                onChange={(e) =>
                  handleInputChange(
                    input.id,
                    "type",
                    e.target.value as "val" | "path"
                  )
                }
                className="p-1 rounded-md bg-background-light border border-accent"
              >
                <option value="val">val</option>
                <option value="path">path</option>
              </select>
              <button
                onClick={() => handleRemoveInput(input.id)}
                className="p-1 text-red-500 hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={handleAddInput}
          className="mt-2 flex items-center text-sm text-nextflow-green hover:underline"
        >
          <Plus size={16} className="mr-1" />
          Add Input
        </button>
      </div>

      <div className="p-2 bg-background-light rounded-md">
        <div className="flex items-center text-xs text-text-light">
          <Info size={14} className="mr-2 flex-shrink-0" />
          <p>
            Script editing is temporarily disabled. This will be re-enabled
            shortly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcessNodePanel;

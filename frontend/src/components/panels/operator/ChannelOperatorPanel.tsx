import type React from "react";
import { useEffect, useId, useState } from "react";
import type { Node } from "reactflow";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import {
  CHANNEL_OPERATOR_TEMPLATES,
  validateChannelOperator,
} from "../../../registry/channelOperator";
import type { NodeData, PortData } from "../../nodes/BaseNode";

interface ChannelOperatorPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const fieldClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

const toPorts = (names: string[], connectable: boolean): PortData[] =>
  names.map((name) => ({ name, label: name, isConnectable: connectable }));

const parseNames = (value: string): string[] =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

/** Edit a channel operator's ports and code, or start from a template. */
const ChannelOperatorPanel: React.FC<ChannelOperatorPanelProps> = ({
  node,
  onSave,
}) => {
  const fieldId = useId();
  const { setEdges } = useWorkflowContext();
  const inputs = (node.data.inputs ?? []).map((port) => port.name);
  const outputs = (node.data.outputs ?? []).map((port) => port.name);
  const code =
    typeof node.data.channelOperatorCode === "string"
      ? node.data.channelOperatorCode
      : "";
  // Port lists are edited as text and applied when valid names come out.
  const [inputText, setInputText] = useState(inputs.join(", "));
  const [outputText, setOutputText] = useState(outputs.join(", "));
  const issues = validateChannelOperator({ inputs, outputs, code });

  const inputKey = inputs.join(", ");
  const outputKey = outputs.join(", ");
  // Resync the text fields when the ports change (e.g. from a template).
  useEffect(() => {
    setInputText(inputKey);
  }, [inputKey]);
  useEffect(() => {
    setOutputText(outputKey);
  }, [outputKey]);

  const savePorts = (
    nextInputs: string[],
    nextOutputs: string[],
    extra = {},
  ) => {
    onSave(node.id, {
      inputs: toPorts(nextInputs, true),
      outputs: toPorts(nextOutputs, true),
      ...extra,
    });
    // Drop connections to ports that no longer exist.
    setEdges((edges) =>
      edges.filter(
        (edge) =>
          (edge.target !== node.id ||
            nextInputs.includes(edge.targetHandle ?? "")) &&
          (edge.source !== node.id ||
            nextOutputs.includes(edge.sourceHandle ?? "")),
      ),
    );
  };

  const applyTemplate = (templateId: string) => {
    const template = CHANNEL_OPERATOR_TEMPLATES.find(
      (entry) => entry.id === templateId,
    );
    if (!template) return;
    savePorts(template.inputs, template.outputs, {
      channelOperatorCode: template.code,
      channelOperatorTemplate: template.id,
      subtitle: template.label,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-light">
        Nextflow channel code between nodes. Refer to the connected channels as{" "}
        <code>input.&lt;port&gt;</code>, assign every{" "}
        <code>output.&lt;port&gt;</code>, and name helper variables{" "}
        <code>local.&lt;name&gt;</code>. The Code tab shows the generated
        statements.
      </p>

      <div>
        <label
          htmlFor={`${fieldId}-template`}
          className="mb-1 block text-xs font-medium text-text-light"
        >
          Template
        </label>
        <select
          id={`${fieldId}-template`}
          value={node.data.channelOperatorTemplate ?? ""}
          onChange={(event) => applyTemplate(event.target.value)}
          className={fieldClassName}
        >
          <option value="" disabled>
            Choose a template to start from…
          </option>
          {CHANNEL_OPERATOR_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}: {template.description}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor={`${fieldId}-inputs`}
            className="mb-1 block text-xs font-medium text-text-light"
          >
            Inputs (comma-separated)
          </label>
          <input
            id={`${fieldId}-inputs`}
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onBlur={() => savePorts(parseNames(inputText), outputs)}
            className={`${fieldClassName} font-mono`}
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor={`${fieldId}-outputs`}
            className="mb-1 block text-xs font-medium text-text-light"
          >
            Outputs (comma-separated)
          </label>
          <input
            id={`${fieldId}-outputs`}
            value={outputText}
            onChange={(event) => setOutputText(event.target.value)}
            onBlur={() => savePorts(inputs, parseNames(outputText))}
            className={`${fieldClassName} font-mono`}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${fieldId}-code`}
          className="mb-1 block text-xs font-medium text-text-light"
        >
          Channel code
        </label>
        <textarea
          id={`${fieldId}-code`}
          value={code}
          onChange={(event) =>
            onSave(node.id, { channelOperatorCode: event.target.value })
          }
          rows={8}
          spellCheck={false}
          className={`${fieldClassName} font-mono text-xs`}
        />
      </div>

      {issues.length > 0 && (
        <ul
          className="space-y-1 text-sm"
          aria-label="Channel operator problems"
        >
          {issues.map((issue) => (
            <li
              key={issue.message}
              className={
                issue.level === "error" ? "text-danger" : "text-yellow-200"
              }
            >
              {issue.level === "error" ? "Error: " : "Warning: "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChannelOperatorPanel;

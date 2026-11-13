// A branch's settings: the condition of each arm (if, else if, …), tested in
// order, and the steps in each arm. A switch on a parameter lists the
// parameter's values instead; N-WAVE writes it as if / else if, the way
// Nextflow's strict syntax has it.

import type { Node } from "@xyflow/react";
import { Plus, Trash2, X } from "lucide-react";
import type React from "react";
import { useId } from "react";
import { evaluateCondition, parameterValues } from "../../../analysis/conditions";
import { armStyle } from "../../../branches/armStyles";
import { armLabel, armOf, branchArms, branchConditions } from "../../../branches/branches";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import { getNodeParameters } from "../../../registry/params";
import type { NodeData } from "../../nodes/BaseNode";

interface BranchPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const inputClass =
  "w-full rounded-md border border-accent bg-background px-2 py-1.5 font-mono text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

/** A value as Groovy writes it: numbers and true/false as they are, text quoted. */
export const groovyValue = (value: string): string => {
  const text = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(text) || text === "true" || text === "false" || text === "null") return text;
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
};

/** A switch's conditions: `params.x == 'value'` for each case. */
export const switchConditions = (parameter: string, values: string[]): string[] =>
  values.map((value) => `params.${parameter} == ${groovyValue(value)}`);

const BranchPanel: React.FC<BranchPanelProps> = ({ node, onSave }) => {
  const fieldId = useId();
  const { nodes, setNodes, setIsDirty } = useWorkflowContext();
  const conditions = branchConditions(node);
  const arms = branchArms(node);
  const switchOn = typeof node.data.switchParameter === "string" ? node.data.switchParameter : null;
  const switchValues = Array.isArray(node.data.switchValues) ? (node.data.switchValues as unknown[]).map(String) : [];
  const parameters = nodes.filter((other) => other.type === "parameters").flatMap((other) => getNodeParameters(other.data));
  const values = parameterValues(nodes);

  const setConditions = (next: string[]) => onSave(node.id, { conditions: next, condition: undefined });
  const setSwitch = (parameter: string, cases: string[]) =>
    onSave(node.id, {
      switchParameter: parameter,
      switchValues: cases,
      conditions: switchConditions(parameter, cases),
      condition: undefined,
    });
  // Removing an arm takes its steps out of the branch; the arms after it move up.
  const removeArm = (index: number) => {
    const removed = index === 0 ? "if" : `else-if-${index}`;
    const renamed = (arm: string) => {
      if (arm === "if" || arm === "else") return arm;
      const at = Number(arm.slice("else-if-".length));
      return at > index ? (at - 1 === 0 ? "if" : `else-if-${at - 1}`) : arm;
    };
    setNodes((current) =>
      current.map((other) => {
        const membership = other.data.branch as { id?: string; arm?: string } | undefined;
        if (membership?.id !== node.id) return other;
        if (membership.arm === removed) return { ...other, data: { ...other.data, branch: undefined } };
        return { ...other, data: { ...other.data, branch: { id: node.id, arm: renamed(String(membership.arm)) } } };
      }),
    );
    setIsDirty(true);
  };
  const takeOut = (id: string) => {
    setNodes((current) => current.map((other) => (other.id === id ? { ...other, data: { ...other.data, branch: undefined } } : other)));
    setIsDirty(true);
  };

  return (
    <div className="space-y-4 text-sm text-text">
      <p className="text-xs text-text-light">
        The workflow runs one arm&apos;s steps: the first arm whose condition holds, else the <strong>else</strong> arm. To
        put a step in an arm, draw a line from the arm&apos;s exit on the Branch node to the step.
      </p>

      {switchOn !== null ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-text-light">Switch on a parameter</legend>
          <label htmlFor={`${fieldId}-parameter`} className="block text-xs text-text-light">
            Parameter
          </label>
          <select
            id={`${fieldId}-parameter`}
            value={switchOn}
            onChange={(event) => setSwitch(event.target.value, switchValues)}
            className={inputClass}
          >
            <option value="">Choose a parameter</option>
            {parameters.map((parameter) => (
              <option key={parameter.name} value={parameter.name}>
                {parameter.name}
              </option>
            ))}
          </select>
          {parameters.length === 0 && (
            <p className="text-xs text-amber-500">Add a Parameters node with the parameter first (say, aligner).</p>
          )}
          <ul aria-label="Cases" className="space-y-1.5">
            {switchValues.map((value, index) => (
              <li key={armOf(index)} className="flex items-center gap-2">
                <span className={`w-14 shrink-0 text-xs font-semibold uppercase ${armStyle(index === 0 ? "if" : `else-if-${index}`).text}`}>
                  case
                </span>
                <input
                  aria-label={`Value ${index + 1}`}
                  value={value}
                  onChange={(event) => setSwitch(switchOn, switchValues.map((other, at) => (at === index ? event.target.value : other)))}
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label={`Remove the case ${value || index + 1}`}
                  onClick={() => {
                    removeArm(index);
                    setSwitch(switchOn, switchValues.filter((_, at) => at !== index));
                  }}
                  className="rounded p-1 text-text-light hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSwitch(switchOn, [...switchValues, ""])}
            className="inline-flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add a case
          </button>
          <p className="text-xs text-text-light">
            Any other value: the <strong>else</strong> arm. Written as{" "}
            <code>if (params.{switchOn || "…"} == …) … else if …</code>: Nextflow&apos;s strict syntax has no switch.
          </p>
        </fieldset>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-text-light">Conditions, tested in order</legend>
          <ul aria-label="Conditions" className="space-y-1.5">
            {conditions.map((condition, index) => {
              const arm = index === 0 ? "if" : `else-if-${index}`;
              const holds = condition ? evaluateCondition(condition, values) : null;
              return (
                <li key={arm} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${fieldId}-${arm}`} className={`w-14 shrink-0 text-xs font-semibold uppercase ${armStyle(arm).text}`}>
                      {armLabel(arm)}
                    </label>
                    <input
                      id={`${fieldId}-${arm}`}
                      value={condition}
                      placeholder="params.aligner == 'star'"
                      onChange={(event) => setConditions(conditions.map((other, at) => (at === index ? event.target.value : other)))}
                      className={inputClass}
                    />
                    {conditions.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove the condition ${armLabel(arm)} ${condition}`}
                        onClick={() => {
                          removeArm(index);
                          setConditions(conditions.filter((_, at) => at !== index));
                        }}
                        className="rounded p-1 text-text-light hover:bg-accent"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {condition && holds === null && (
                    <p className="pl-16 text-xs text-text-light">Decided when the workflow runs (it can&apos;t be told from the parameters now).</p>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setConditions([...conditions, ""])}
            className="inline-flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-xs hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add else if
          </button>
          <p className="text-xs text-text-light">
            A condition is Groovy on the parameters: <code>params.aligner == &apos;star&apos;</code>,{" "}
            <code>!params.skip_qc</code>, <code>params.depth &gt; 10 &amp;&amp; params.trim</code>.
          </p>
        </fieldset>
      )}

      <section aria-label="Steps in the arms" className="space-y-2">
        <h3 className="text-xs font-medium text-text-light">Steps in the arms</h3>
        {arms.map((arm) => {
          const members = nodes.filter((other) => (other.data.branch as { id?: string; arm?: string } | undefined)?.id === node.id && (other.data.branch as { arm?: string }).arm === arm);
          return (
            <div key={arm}>
              <p className={`text-xs font-semibold uppercase ${armStyle(arm).text}`}>{armLabel(arm)}</p>
              {members.length === 0 ? (
                <p className="text-xs text-text-light">{arm === "else" ? "Nothing: when no condition holds, no step runs here." : "No steps yet."}</p>
              ) : (
                <ul className="mt-0.5 flex flex-wrap gap-1">
                  {members.map((member) => (
                    <li key={member.id} className="inline-flex items-center gap-1 rounded-full border border-panel-border px-2 py-0.5 text-xs">
                      {String(member.data.label || member.type)}
                      <button
                        type="button"
                        aria-label={`Take ${String(member.data.label || member.type)} out of the branch`}
                        onClick={() => takeOut(member.id)}
                        className="rounded-full hover:bg-accent"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default BranchPanel;

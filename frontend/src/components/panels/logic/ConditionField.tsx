// One condition of a branch: a parameter, a comparison and a value (the common
// case), with a parameter added right here if the workflow has none yet; or,
// for anything else, the condition written as code (Groovy).

import { Code, ListChecks, Plus } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import {
  COMPARISONS,
  type Comparison,
  comparisonsFor,
  type FormCondition,
  readCondition,
  takesValue,
  writeCondition,
} from "../../../branches/conditionForm";
import { RESERVED_PARAM_NAMES, type WorkflowParameter, type WorkflowParameterType } from "../../../registry/params";

const inputClass =
  "w-full rounded-md border border-accent bg-background px-2 py-1 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";
const NEW_PARAMETER = "\u0000new";

/** The kinds of value a new parameter can have, as the form names them. */
const NEW_TYPES: Array<{ type: WorkflowParameterType; label: string; example: string }> = [
  { type: "text", label: "a word (aligner: star)", example: "star" },
  { type: "number", label: "a number (min_depth: 10)", example: "10" },
  { type: "boolean", label: "on or off (skip_qc)", example: "false" },
];

/** Why a new parameter's name can't be used, or null. */
export const newParameterProblem = (name: string, existing: WorkflowParameter[]): string | null => {
  if (!name) return "Give it a name.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "Use letters, digits and _, not starting with a digit.";
  if (RESERVED_PARAM_NAMES.has(name) || name.startsWith("samplesheet_")) return `params.${name} is used by N-WAVE.`;
  if (existing.some((parameter) => parameter.name === name)) return `params.${name} exists already: choose it above.`;
  return null;
};

interface ConditionFieldProps {
  /** "if" or "else if", for the field's label. */
  label: string;
  labelClass: string;
  condition: string;
  /** The workflow's parameters (Parameters nodes), without reference files. */
  parameters: WorkflowParameter[];
  onChange: (condition: string) => void;
  onAddParameter: (parameter: WorkflowParameter) => void;
  /** Shown after the field: the remove button. */
  children?: React.ReactNode;
}

const ConditionField: React.FC<ConditionFieldProps> = ({
  label,
  labelClass,
  condition,
  parameters,
  onChange,
  onAddParameter,
  children,
}) => {
  const fieldId = useId();
  const read = readCondition(condition);
  // Code when it is more than one comparison; the form otherwise.
  const [asCode, setAsCode] = useState(condition.trim() !== "" && read === null);
  const [form, setForm] = useState<FormCondition>(
    read ?? { parameter: parameters[0]?.name ?? "", comparison: comparisonsFor(parameters[0]?.type)[0], value: "" },
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; type: WorkflowParameterType; value: string }>({
    name: "",
    type: "text",
    value: "",
  });
  const typeOf = (name: string) => parameters.find((parameter) => parameter.name === name)?.type;
  const chosen = parameters.find((parameter) => parameter.name === form.parameter);
  const unknown = form.parameter !== "" && !chosen;

  const update = (next: FormCondition) => {
    setForm(next);
    onChange(writeCondition(next, typeOf(next.parameter)) ?? "");
  };
  const choose = (name: string, type = typeOf(name)) => {
    const allowed = comparisonsFor(type);
    update({ parameter: name, comparison: allowed.includes(form.comparison) ? form.comparison : allowed[0], value: form.value });
  };
  const draftProblem = newParameterProblem(draft.name.trim(), parameters);
  const addParameter = () => {
    if (draftProblem) return;
    const name = draft.name.trim();
    const example = NEW_TYPES.find((entry) => entry.type === draft.type)?.example ?? "";
    onAddParameter({ name, type: draft.type, value: draft.value.trim() || example });
    setAdding(false);
    setDraft({ name: "", type: "text", value: "" });
    const allowed = comparisonsFor(draft.type);
    update({ parameter: name, comparison: allowed[0], value: draft.type === "boolean" ? "" : draft.value.trim() });
  };

  return (
    <div className="space-y-1.5 rounded-md border border-panel-border p-2" data-condition>
      <div className="flex items-center gap-2">
        <span className={`w-14 shrink-0 text-xs font-semibold uppercase ${labelClass}`}>{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-light" title={condition}>
          {condition || "no condition yet"}
        </span>
        <button
          type="button"
          onClick={() => setAsCode(!asCode)}
          disabled={asCode && condition.trim() !== "" && read === null}
          title={
            asCode && condition.trim() !== "" && read === null
              ? "This condition is more than one comparison: it stays code"
              : undefined
          }
          className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-light hover:bg-accent disabled:opacity-40"
        >
          {asCode ? <ListChecks className="h-3.5 w-3.5" aria-hidden /> : <Code className="h-3.5 w-3.5" aria-hidden />}
          {asCode ? "Use the form" : "Write it as code"}
        </button>
        {children}
      </div>

      {asCode ? (
        <div className="space-y-1">
          <label htmlFor={`${fieldId}-code`} className="sr-only">
            Condition of the {label} arm, as code
          </label>
          <input
            id={`${fieldId}-code`}
            value={condition}
            placeholder="params.depth > 10 && params.trim"
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClass} mt-1 font-mono`}
          />
          <p className="text-[11px] text-text-light">
            Groovy on the parameters: <code>params.aligner == &apos;star&apos;</code>, <code>!params.skip_qc</code>,{" "}
            <code>params.depth &gt; 10 &amp;&amp; params.trim</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-1.5">
          <label htmlFor={`${fieldId}-parameter`} className="sr-only">
            Parameter of the {label} arm
          </label>
          <select
            id={`${fieldId}-parameter`}
            value={adding ? NEW_PARAMETER : form.parameter}
            onChange={(event) => {
              if (event.target.value === NEW_PARAMETER) setAdding(true);
              else {
                setAdding(false);
                choose(event.target.value);
              }
            }}
            className={`${inputClass} col-span-2`}
          >
            <option value="">Choose a parameter</option>
            {parameters.map((parameter) => (
              <option key={parameter.name} value={parameter.name}>
                {parameter.name} (now {parameter.type === "boolean" ? (parameter.value === "true" ? "on" : "off") : parameter.value || "empty"})
              </option>
            ))}
            {unknown && <option value={form.parameter}>{form.parameter} (not in a Parameters node)</option>}
            <option value={NEW_PARAMETER}>New parameter…</option>
          </select>

          {adding ? (
            <fieldset className="col-span-2 space-y-1.5 rounded-md bg-accent/40 p-2">
              <legend className="sr-only">New parameter</legend>
              <label className="mt-1.5 block text-[11px] text-text-light" htmlFor={`${fieldId}-new-name`}>
                Name (in the code: <code>params.{draft.name.trim() || "name"}</code>)
              </label>
              <input
                id={`${fieldId}-new-name`}
                value={draft.name}
                placeholder="aligner"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className={inputClass}
              />
              <label className="block text-[11px] text-text-light" htmlFor={`${fieldId}-new-type`}>
                Its value is
              </label>
              <select
                id={`${fieldId}-new-type`}
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value as WorkflowParameterType })}
                className={inputClass}
              >
                {NEW_TYPES.map((entry) => (
                  <option key={entry.type} value={entry.type}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {draft.type !== "boolean" && (
                <>
                  <label className="block text-[11px] text-text-light" htmlFor={`${fieldId}-new-value`}>
                    Value for now (the run can change it)
                  </label>
                  <input
                    id={`${fieldId}-new-value`}
                    value={draft.value}
                    type={draft.type === "number" ? "number" : "text"}
                    placeholder={NEW_TYPES.find((entry) => entry.type === draft.type)?.example}
                    onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                    className={inputClass}
                  />
                </>
              )}
              {draft.name.trim() !== "" && draftProblem && <p className="text-[11px] text-amber-600">{draftProblem}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={addParameter}
                  disabled={Boolean(draftProblem)}
                  className="inline-flex items-center gap-1 rounded-md bg-nextflow-green px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add parameter
                </button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 py-1 text-xs hover:bg-accent">
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-text-light">It goes into the workflow&apos;s Parameters node (made if there is none).</p>
            </fieldset>
          ) : (
            <>
              <label htmlFor={`${fieldId}-comparison`} className="sr-only">
                Comparison of the {label} arm
              </label>
              <select
                id={`${fieldId}-comparison`}
                value={form.comparison}
                disabled={!form.parameter}
                onChange={(event) => update({ ...form, comparison: event.target.value as Comparison })}
                className={`${inputClass} ${takesValue(form.comparison) ? "" : "col-span-2"}`}
              >
                {comparisonsFor(chosen?.type).map((comparison) => (
                  <option key={comparison} value={comparison}>
                    {COMPARISONS[comparison].label}
                  </option>
                ))}
              </select>
              {takesValue(form.comparison) && (
                <>
                  <label htmlFor={`${fieldId}-value`} className="sr-only">
                    Value of the {label} arm
                  </label>
                  <input
                    id={`${fieldId}-value`}
                    value={form.value}
                    disabled={!form.parameter}
                    type={chosen?.type === "number" ? "number" : "text"}
                    placeholder={chosen?.value || "value"}
                    onChange={(event) => update({ ...form, value: event.target.value })}
                    className={`${inputClass} w-32`}
                  />
                </>
              )}
            </>
          )}
          {parameters.length === 0 && !adding && (
            <p className="col-span-2 text-[11px] text-text-light">
              No parameters yet: choose <strong>New parameter…</strong> to add one (for example <code>aligner</code>).
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ConditionField;

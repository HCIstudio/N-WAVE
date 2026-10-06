import type React from "react";
import { useId } from "react";
import type { NfCoreValueInput } from "../../../registry/nfcore/inputChannels";

type ValueMap = Record<string, string | number | boolean>;

interface NfCoreValueInputsProps {
  inputs: NfCoreValueInput[];
  values: ValueMap;
  onChange: (values: ValueMap) => void;
  legend?: string;
  hint?: React.ReactNode;
}

const inputClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

/** Settings for a module's `val` inputs, one control per value type. */
const NfCoreValueInputs: React.FC<NfCoreValueInputsProps> = ({
  inputs,
  values,
  onChange,
  legend = "Module inputs",
  hint = (
    <>
      Values passed to the module&apos;s <code>val</code> inputs.
    </>
  ),
}) => {
  const fieldId = useId();
  if (inputs.length === 0) return null;

  const set = (name: string, value: string | number | boolean) =>
    onChange({ ...values, [name]: value });

  return (
    <fieldset className="space-y-3 border-t border-accent pt-4">
      <legend className="text-sm font-semibold text-text">{legend}</legend>
      <p className="text-xs text-text-light">{hint}</p>
      {inputs.map((input) => {
        const id = `${fieldId}-${input.name}`;
        const value = values[input.name] ?? input.defaultValue;
        const description = input.description ? (
          <p id={`${id}-description`} className="text-xs text-text-light">
            {input.description}
          </p>
        ) : null;

        if (input.type === "boolean") {
          return (
            <div key={input.name} className="space-y-1">
              <label
                htmlFor={id}
                className="flex items-center gap-2 text-sm text-text"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={value === true || value === "true"}
                  onChange={(event) => set(input.name, event.target.checked)}
                  aria-describedby={
                    description ? `${id}-description` : undefined
                  }
                  className="rounded border-accent"
                />
                <span className="font-mono">{input.name}</span>
              </label>
              {description}
            </div>
          );
        }

        const isNumber = input.type === "integer" || input.type === "float";
        return (
          <div key={input.name} className="space-y-1">
            <label htmlFor={id} className="block text-sm text-text">
              <span className="font-mono">{input.name}</span>
              {input.type === "expression" && (
                <span className="ml-2 text-xs text-text-light">
                  Groovy expression
                </span>
              )}
            </label>
            <input
              id={id}
              type={isNumber ? "number" : "text"}
              step={input.type === "float" ? "any" : undefined}
              value={String(value)}
              onChange={(event) =>
                set(
                  input.name,
                  isNumber && event.target.value !== ""
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
              aria-describedby={description ? `${id}-description` : undefined}
              className={`${inputClassName} ${input.type === "expression" ? "font-mono" : ""}`}
            />
            {description}
          </div>
        );
      })}
    </fieldset>
  );
};

export default NfCoreValueInputs;

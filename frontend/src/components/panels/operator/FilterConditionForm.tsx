// A filter's condition as a form: keep the items whose part (or a property
// of it) compares so with a value. Anything more stays code.

import type React from "react";
import { useId } from "react";
import { COMPARISONS, type Comparison, takesValue } from "../../../branches/conditionForm";
import { type FilterForm, writeFilter } from "../../../registry/channelOperatorFit";

const inputClass =
  "w-full rounded-md border border-accent bg-background px-2 py-1 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

/** Properties worth offering for a part with this name. */
const PROPERTIES: Record<string, string[]> = {
  meta: ["meta.id", "meta.single_end"],
};

interface FilterConditionFormProps {
  form: FilterForm;
  onChange: (code: string) => void;
}

const FilterConditionForm: React.FC<FilterConditionFormProps> = ({ form, onChange }) => {
  const fieldId = useId();
  const suggestions = form.fields.flatMap((field) => [field, ...(PROPERTIES[field] ?? [])]);
  const update = (next: Partial<FilterForm>) => {
    const code = writeFilter({ ...form, ...next });
    if (code !== null) onChange(code);
  };

  return (
    <fieldset className="space-y-2 rounded-md border border-accent p-2">
      <legend className="px-1 text-xs font-medium text-text-light">Keep the items where</legend>
      <p className="text-xs text-text-light">
        Each item has the parts <code>{form.fields.join(", ")}</code>. Compare one of them (or a property, such as{" "}
        <code>meta.id</code>) with a value.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[120px] flex-1">
          <input
            id={`${fieldId}-field`}
            aria-label="Part"
            list={`${fieldId}-fields`}
            defaultValue={form.field}
            key={form.field}
            onBlur={(event) => {
              const field = event.target.value.trim();
              if (new RegExp(`^(?:${form.fields.join("|")})(?:\\.\\w+)*$`).test(field)) update({ field });
              else event.target.value = form.field;
            }}
            className={`${inputClass} font-mono`}
          />
          <datalist id={`${fieldId}-fields`}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        <select
          aria-label="Comparison"
          value={form.comparison}
          onChange={(event) => {
            const comparison = event.target.value as Comparison;
            update({ comparison, value: takesValue(comparison) ? form.value || "value" : "" });
          }}
          className={`${inputClass} w-auto`}
        >
          {(Object.keys(COMPARISONS) as Comparison[]).map((comparison) => (
            <option key={comparison} value={comparison}>
              {COMPARISONS[comparison].label}
            </option>
          ))}
        </select>
        {takesValue(form.comparison) && (
          <input
            aria-label="Value"
            defaultValue={form.value}
            key={`${form.field}-${form.value}`}
            onBlur={(event) => update({ value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`${inputClass} min-w-[100px] flex-1`}
          />
        )}
      </div>
      <p className="text-xs text-text-light">Text is compared as text, numbers as numbers. For more, change the code below.</p>
    </fieldset>
  );
};

export default FilterConditionForm;

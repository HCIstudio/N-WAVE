// A number and a unit, written as Nextflow writes them ("4.GB", "30.m"):
// MemoryInput for memory, TimeInput for time.

import type React from "react";
import { useEffect, useState } from "react";

interface UnitInputProps {
  /** As Nextflow writes it, e.g. "4.GB" or "30.m". */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

interface Units {
  pattern: RegExp;
  units: string[];
  fallback: string;
  width: string;
}

const MEMORY: Units = {
  pattern: /([0-9]+(?:\.[0-9]+)?)\s*\.?\s*(KB|MB|GB|TB)/i,
  units: ["KB", "MB", "GB", "TB"],
  fallback: "GB",
  width: "min-w-[4.5rem]",
};
const TIME: Units = {
  pattern: /([0-9]+(?:\.[0-9]+)?)\s*\.?(s|m|h|d)/i,
  units: ["s", "m", "h", "d"],
  fallback: "h",
  width: "min-w-[3.5rem]",
};

const FIELD = "p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent";

const parse = (value: string, { pattern, units, fallback }: Units) => {
  const match = value?.match(pattern);
  const unit = units.find((u) => u.toLowerCase() === match?.[2]?.toLowerCase());
  return { amount: match?.[1] ?? "1", unit: unit ?? fallback };
};

const UnitInput: React.FC<UnitInputProps & { kind: Units }> = ({ value, onChange, id, className, kind }) => {
  const [{ amount, unit }, setParts] = useState(() => parse(value, kind));
  useEffect(() => setParts(parse(value, kind)), [value, kind]);

  const change = (next: { amount: string; unit: string }) => {
    setParts(next);
    if (next.amount) onChange(`${next.amount}.${next.unit}`);
  };

  return (
    <div className={`flex items-center gap-1 w-full overflow-hidden ${className || ""}`.trim()}>
      <input
        id={id}
        type="number"
        min="0"
        step="0.1"
        value={amount}
        onChange={(e) => change({ amount: e.target.value, unit })}
        className={`flex-1 min-w-0 ${FIELD}`}
      />
      <select value={unit} onChange={(e) => change({ amount, unit: e.target.value })} className={`${kind.width} ${FIELD}`}>
        {kind.units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
};

export const MemoryInput: React.FC<UnitInputProps> = (props) => <UnitInput {...props} kind={MEMORY} />;
export const TimeInput: React.FC<UnitInputProps> = (props) => <UnitInput {...props} kind={TIME} />;

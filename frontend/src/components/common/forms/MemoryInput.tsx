import type React from "react";
import { useState, useEffect } from "react";

export interface MemoryInputProps {
  /**
   * Current value as Nextflow memory string, e.g. "4.GB" or "512.MB".
   */
  value: string;
  /**
   * Callback invoked with updated value in the same format.
   */
  onChange: (value: string) => void;
  /** Optional label ARIA **/
  id?: string;
  className?: string;
}

const MEMORY_UNITS = [
  { label: "KB", value: "KB" },
  { label: "MB", value: "MB" },
  { label: "GB", value: "GB" },
  { label: "TB", value: "TB" },
];

function parseMemory(mem: string): { amount: string; unit: string } {
  const match = mem?.match(/([0-9]+(?:\.[0-9]+)?)\s*\.?\s*(KB|MB|GB|TB)/i);
  return {
    amount: match ? match[1] : "1",
    unit: match ? match[2].toUpperCase() : "GB",
  };
}

const MemoryInput: React.FC<MemoryInputProps> = ({
  value,
  onChange,
  id,
  className,
}) => {
  const initial = parseMemory(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState(initial.unit);

  // Prop changes → update local state
  useEffect(() => {
    const { amount: a, unit: u } = parseMemory(value);
    setAmount(a);
    setUnit(u);
  }, [value]);

  const propagate = (amt: string, un: string) => {
    if (!amt) return; // empty
    onChange(`${amt}.${un}`);
  };

  return (
    <div
      className={`flex items-center gap-1 w-full overflow-hidden ${
        className || ""
      }`.trim()}
    >
      <input
        id={id}
        type="number"
        min="0"
        step="0.1"
        value={amount}
        onChange={(e) => {
          const v = e.target.value;
          setAmount(v);
          propagate(v, unit);
        }}
        className="flex-1 min-w-0 p-2 border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
      />
      <select
        value={unit}
        onChange={(e) => {
          const u = e.target.value;
          setUnit(u);
          propagate(amount, u);
        }}
        className="p-2 min-w-[4.5rem] border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
      >
        {MEMORY_UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MemoryInput;

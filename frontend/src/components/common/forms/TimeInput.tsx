import type React from "react";
import { useState, useEffect } from "react";

export interface TimeInputProps {
  /** Current value in Nextflow time string, e.g. "30.m" or "1.h" */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

const TIME_UNITS = [
  { label: "s", value: "s" },
  { label: "m", value: "m" },
  { label: "h", value: "h" },
  { label: "d", value: "d" },
];

function parseTime(time: string): { amount: string; unit: string } {
  const match = time?.match(/([0-9]+(?:\.[0-9]+)?)\s*\.?(s|m|h|d)/i);
  return {
    amount: match ? match[1] : "1",
    unit: match ? match[2] : "h",
  };
}

const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onChange,
  id,
  className,
}) => {
  const initial = parseTime(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState(initial.unit);

  useEffect(() => {
    const { amount: a, unit: u } = parseTime(value);
    setAmount(a);
    setUnit(u);
  }, [value]);

  const propagate = (amt: string, un: string) => {
    if (!amt) return;
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
        className="p-2 min-w-[3.5rem] border border-accent rounded-md bg-background focus:ring-2 focus:ring-nextflow-green focus:border-transparent"
      >
        {TIME_UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TimeInput;

import type React from "react";
import { useState, useMemo } from "react";
import { nextflowProcesses } from "../../../data/nextflowProcesses";
import type { NextflowProcess } from "../../../data/types";
import DynamicIcon from "../ui/DynamicIcon";
import SearchInput from "./SearchInput";

interface ProcessDropdownProps {
  onSelectProcess: (process: NextflowProcess) => void;
  onClose: () => void;
}

const ProcessDropdown: React.FC<ProcessDropdownProps> = ({
  onSelectProcess,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProcesses = useMemo(() => {
    if (!searchTerm) {
      return nextflowProcesses;
    }

    return nextflowProcesses
      .map((category) => {
        const processes = category.processes.filter(
          (process) =>
            process.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            process.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return { ...category, processes };
      })
      .filter((category) => category.processes.length > 0);
  }, [searchTerm]);

  return (
    <div className="absolute right-0 mt-2 w-72 bg-background border border-accent rounded-md shadow-lg z-20 flex flex-col">
      <div className="p-2 border-b border-accent">
        <SearchInput
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search nodes..."
        />
      </div>
      <div className="p-1 overflow-y-auto max-h-96">
        {filteredProcesses.length > 0 ? (
          filteredProcesses.map((category) => (
            <div key={category.category}>
              <p className="px-3 py-2 text-xs font-semibold text-text-light tracking-wider uppercase">
                {category.category}
              </p>
              {category.processes.map((process: NextflowProcess) => (
                <button
                  key={process.type + process.label}
                  onClick={() => onSelectProcess(process)}
                  className="w-full text-left px-3 py-2 flex items-center text-sm text-text rounded-md hover:bg-accent"
                >
                  <DynamicIcon name={process.icon} className="mr-3 w-5 h-5" />
                  <div>
                    <p className="font-medium">{process.label}</p>
                    <p className="text-xs text-text-light">
                      {process.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-text-light p-4">
            No nodes found.
          </p>
        )}
      </div>
    </div>
  );
};

export default ProcessDropdown;

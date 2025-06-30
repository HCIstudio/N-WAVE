import { Handle, Position, type NodeProps } from "reactflow";
import { memo, type ReactNode } from "react";
import { DynamicIcon } from "../common";
import clsx from "clsx";
import type { SelectedFile } from "../../data/types";

export interface PortData {
  name: string;
  isConnectable?: boolean;
  label?: string; // Display label for the port
}

export interface FileObject {
  name: string;
  content: string;
  size: number;
  fileType?: string; // Detected file type
  _id?: string; // Backend metadata ID (optional)
}

// Define the shape of the node's data
export interface NodeData {
  icon?: string;
  label?: string;
  subtitle?: string;
  note?: string; // Small additional note below subtitle
  status?: "running" | "success" | "error" | "waiting" | "disabled";
  inputs?: PortData[];
  outputs?: PortData[];
  cpuUsage?: number;
  memoryUsage?: number;
  // Custom data properties
  files?: FileObject[];
  selectedFiles?: SelectedFile[];
  selectedFilterFiles?: FileObject[]; // Files selected for filter operations
  fileContent?: string;
  processedContent?: string;
  // Operator-specific properties
  operatorType?: string; // Specifies which operator: 'filter', 'map', 'reduce'
  filterText?: string;
  isHighlight?: boolean;
  _hasWarning?: boolean; // Warning state (e.g., missing file content)
  [key: string]: any; // Allow other properties

  // Process-specific properties
  processInputs?: { type: string; name: string }[];
}

const onMouseDown = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const BaseNode = ({
  data = {},
  type,
  selected,
  isConnectable,
  children,
}: NodeProps<NodeData> & {
  children?: ReactNode;
}) => {
  const iconName = data.icon || "DefaultIcon";

  // Base classes for the node
  const nodeClasses = [
    "group",
    "min-w-[120px]", // Ensure a minimum width
    "min-h-[100px]", // Ensure a minimum height
    "bg-[#fcfcfc]", // Corresponds to --color-node-background, a light grey
    "rounded-lg",
    "flex",
    "flex-col",
    "items-center",
    "justify-center",
    "p-4", // Increased padding for better spacing
    "relative",
    "transition-all",
    "duration-300", // Smoother transitions for status changes
    "ease-in-out",
  ];

  // Conditional classes based on node state
  if (data._hasWarning) {
    // Warning state takes precedence: missing files or content
    nodeClasses.push(
      "ring-2",
      "ring-yellow-500",
      "border-yellow-500",
      "bg-yellow-50"
    );
    // If selected AND has warning, add extra glow
    if (selected || data.isHighlight) {
      nodeClasses.push("shadow-lg", "shadow-yellow-500/50");
    }
  } else if (selected || data.isHighlight) {
    nodeClasses.push("ring-2", "ring-nextflow-green", "border-transparent");
  } else {
    nodeClasses.push("border-gray-600"); // Default border
  }

  if (data.status === "running") {
    nodeClasses.push(
      "border-yellow-400",
      "border-2",
      "animate-pulse",
      "bg-yellow-50"
    );
  } else if (data.status === "success") {
    nodeClasses.push("border-green-500", "border-2", "bg-green-50");
  } else if (data.status === "error") {
    nodeClasses.push("border-red-500", "border-2", "bg-red-50");
  } else if (data.status === "waiting") {
    nodeClasses.push("border-purple-400", "border-2", "bg-purple-50");
  } else if (data.status === "disabled") {
    nodeClasses.push("opacity-60", "bg-gray-100");
  }

  return (
    <div
      className={clsx(nodeClasses, {
        "shadow-lg shadow-nextflow-green/50": selected || data.isHighlight,
      })}
    >
      {/* Input Handles */}
      {data.inputs?.map((port, index, arr) => (
        <div
          key={port.name}
          className="absolute left-0"
          style={{ top: `${(100 / (arr.length + 1)) * (index + 1)}%` }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={port.name}
            className="!w-3 !h-3 !-left-1.5 !bg-gray-400"
            isConnectable={isConnectable}
            onMouseDown={onMouseDown}
          />
          {port.label && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-white px-1 py-0.5 rounded shadow-sm border">
              {port.label}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-center w-10 h-10 mb-1">
        <DynamicIcon name={iconName} className="w-8 h-8 text-gray-700" />
      </div>

      <div className="text-center">
        <div className="text-xs font-semibold text-gray-800 truncate">
          {data.label || "Unnamed Node"}
        </div>
        {(data.subtitle || type) && (
          <div className="text-[10px] text-gray-500 truncate">
            {data.subtitle || type}
          </div>
        )}
        {data.note && (
          <div className="text-[8px] text-gray-400 truncate mt-0.5">
            {data.note}
          </div>
        )}
      </div>

      {/* Execution Status Indicator */}
      {data.status && data.status !== "disabled" && (
        <div className="absolute top-2 right-2">
          {data.status === "running" && (
            <div
              className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"
              title="Running"
            />
          )}
          {data.status === "success" && (
            <div
              className="w-3 h-3 bg-green-500 rounded-full"
              title="Completed"
            />
          )}
          {data.status === "error" && (
            <div className="w-3 h-3 bg-red-500 rounded-full" title="Failed" />
          )}
          {data.status === "waiting" && (
            <div
              className="w-3 h-3 bg-purple-400 rounded-full"
              title="Waiting"
            />
          )}
        </div>
      )}

      {/* Render children if they exist */}
      {children}

      {/* Output Handles */}
      {data.outputs?.map((port, index, arr) => (
        <div
          key={port.name}
          className="absolute right-0"
          style={{ top: `${(100 / (arr.length + 1)) * (index + 1)}%` }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id={port.name}
            className="!w-3 !h-3 !-right-1.5 !bg-gray-400"
            isConnectable={port.isConnectable ?? true}
            onMouseDown={onMouseDown}
          />
          {port.label && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-white px-1 py-0.5 rounded shadow-sm border">
              {port.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default memo(BaseNode);

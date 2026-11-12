// A branch (if/else) on the canvas: the condition it tests on the workflow's
// parameters, which arm runs with their values now, and an exit for each arm
// (dashed lines lead from them to the arms' steps, framed as lanes). The
// steps where the arms meet again read whichever arm ran.

import { Handle, type Node, type NodeProps, Position, useNodes } from "@xyflow/react";
import clsx from "clsx";
import { GitFork } from "lucide-react";
import type React from "react";
import { evaluateCondition, parameterValues } from "../../analysis/conditions";
import { paramsRead } from "../../branches/branches";
import type { NodeData } from "./BaseNode";

/** The arm colors, shared with the lanes and the lines to the steps. */
export const ARM_STYLES = {
  if: { line: "#059669", label: "if", lane: "border-emerald-500/70 bg-emerald-500/5", text: "text-emerald-700" },
  else: { line: "#d97706", label: "else", lane: "border-amber-500/70 bg-amber-500/5", text: "text-amber-700" },
} as const;

const BranchNode: React.FC<NodeProps<Node<NodeData>>> = ({ data, selected }) => {
  const nodes = useNodes<Node<NodeData>>();
  const condition = String(data.condition ?? "");
  const holds = condition ? evaluateCondition(condition, parameterValues(nodes)) : null;
  const params = paramsRead(condition);
  const now =
    holds === true
      ? "With the parameters now: the if arm runs"
      : holds === false
        ? "With the parameters now: the else arm runs"
        : "Decided when the workflow runs";
  return (
    <section
      data-branch
      aria-label={`Branch: if ${condition}`}
      className={clsx(
        "relative w-60 rounded-lg border-2 bg-violet-50 text-gray-900 shadow-sm",
        selected ? "border-violet-600 ring-2 ring-violet-300" : "border-violet-400",
      )}
    >
      <div className="flex items-center gap-1 rounded-t-md bg-violet-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        <GitFork className="h-3 w-3" aria-hidden />
        Branch · if / else
      </div>
      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold uppercase text-violet-700">if</p>
        <code className="block break-words font-mono text-xs">{condition || "(no condition)"}</code>
        {params.length > 0 && (
          <p className="mt-1 text-[10px] text-gray-600">
            Chosen by {params.length === 1 ? "the parameter" : "the parameters"} {params.join(", ")}
          </p>
        )}
        <p
          className="mt-1 text-[11px] font-medium text-violet-800"
          data-branch-now={holds === null ? "unknown" : holds ? "if" : "else"}
        >
          {now}
        </p>
        <div className="mt-2 space-y-1 text-right text-[10px] font-semibold uppercase">
          <p className={clsx(ARM_STYLES.if.text, holds === false && "opacity-40")}>if →</p>
          <p className={clsx(ARM_STYLES.else.text, holds === true && "opacity-40")}>else →</p>
        </div>
      </div>
      {/* The parameters it reads come in on the left; each arm leaves on the right. */}
      <Handle
        type="target"
        position={Position.Left}
        id="params"
        isConnectable={false}
        className="!h-2 !w-2 !bg-violet-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="if"
        isConnectable={false}
        style={{ top: "auto", bottom: 30 }}
        className="!h-2.5 !w-2.5 !bg-emerald-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="else"
        isConnectable={false}
        style={{ top: "auto", bottom: 12 }}
        className="!h-2.5 !w-2.5 !bg-amber-600"
      />
    </section>
  );
};

export default BranchNode;

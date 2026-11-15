// A branch (if / else if / else) on the canvas: each arm's condition on the
// workflow's parameters, which arm runs with their values now, and an exit
// per arm. Dashed lines lead from the exits to the arms' steps (framed as
// lanes); a line drawn from an exit to a step puts the step in that arm.

import { Handle, type Node, type NodeProps, Position, useNodes } from "@xyflow/react";
import clsx from "clsx";
import { GitFork } from "lucide-react";
import type React from "react";
import { evaluateCondition, parameterValues } from "../../analysis/conditions";
import { armStyle } from "../../branches/armStyles";
import { armLabel, armProblem, branchArms, branchConditions, paramsRead } from "../../branches/branches";
import { useArmDrag } from "../../branches/useArmDrag";
import { NODE_KINDS } from "../../workflows/nodeKinds";
import type { NodeData } from "./BaseNode";

/** The arm that runs with these parameter values; null when it can't be told before the run. */
export const runningArm = (conditions: string[], params: ReturnType<typeof parameterValues>): string | null => {
  for (const [index, condition] of conditions.entries()) {
    const holds = evaluateCondition(condition, params);
    if (holds === null) return null;
    if (holds) return index === 0 ? "if" : `else-if-${index}`;
  }
  return "else";
};

/** Starting a line from an exit selects no text (the node's labels, or the canvas behind it). */
const noTextSelection = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const BranchNode: React.FC<NodeProps<Node<NodeData>>> = ({ id, type, data, selected }) => {
  const nodes = useNodes<Node<NodeData>>();
  const armDrag = useArmDrag();
  // Another branch's arm line is being drawn: this branch can go into that arm (nested), or why not.
  const nestRefusal =
    armDrag && armDrag.branch !== id ? armProblem(armDrag.branch, { id, type, data } as Node<NodeData>, nodes) : null;
  const nestTarget = Boolean(armDrag) && armDrag?.branch !== id && nestRefusal === null;
  const conditions = branchConditions({ data });
  const arms = branchArms({ data });
  const running = conditions.length > 0 ? runningArm(conditions, parameterValues(nodes)) : null;
  const params = [...new Set(conditions.flatMap(paramsRead))];
  const kind = NODE_KINDS.logic;
  return (
    <section
      data-branch
      data-branch-now={running ?? "unknown"}
      aria-label={`Branch: ${conditions.map((condition, index) => `${index === 0 ? "if" : "else if"} ${condition}`).join(", ")}${conditions.length > 0 ? ", else" : ""}`}
      className={clsx(
        "relative w-64 select-none rounded-lg border-2 bg-fuchsia-50 text-gray-900 shadow-sm",
        selected ? "border-fuchsia-600 ring-2 ring-fuchsia-300" : "border-fuchsia-400",
      )}
    >
      {/* In an arm of another branch (nested): that arm's line comes in on top. */}
      {(Boolean(data.branch) || nestTarget) && (
        <Handle
          type="target"
          position={Position.Top}
          id="branch"
          isConnectable={nestTarget}
          onMouseDown={noTextSelection}
          data-arm-target={nestTarget ? "fits" : undefined}
          title={nestTarget ? `Drop here: puts this branch in the ${armLabel(armDrag?.arm ?? "")} arm` : "In another branch's arm"}
          className={clsx(
            "!border-0",
            nestTarget ? "!h-4 !w-4 !bg-fuchsia-500 ring-4 ring-fuchsia-300/70 animate-pulse" : "!h-2 !w-2 !bg-fuchsia-400",
          )}
        />
      )}
      <div
        className="flex items-center gap-1 rounded-t-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ backgroundColor: kind.color, color: kind.text }}
        title={kind.description}
      >
        <GitFork className="h-3 w-3" aria-hidden />
        {kind.short} · {String(data.label || "Branch")}
      </div>
      <div className="px-3 pb-1 pt-1.5">
        {params.length > 0 ? (
          <p className="text-[10px] text-gray-600">
            Chosen by {params.length === 1 ? "the parameter" : "the parameters"} {params.join(", ")}
          </p>
        ) : (
          <p className="text-[10px] text-gray-600">{conditions.length === 0 ? "No condition yet: double-click to add one." : "Decided when the workflow runs."}</p>
        )}
      </div>
      <ul aria-label="Arms" className="pb-1.5">
        {arms.map((arm, index) => {
          const style = armStyle(arm);
          const condition = arm === "else" ? null : conditions[index];
          const runs = running === arm;
          const drawing = armDrag?.branch === id && armDrag.arm === arm;
          return (
            <li
              key={arm}
              data-arm={arm}
              data-runs={running === null ? "unknown" : String(runs)}
              data-drawing={drawing ? "true" : undefined}
              className={clsx(
                "relative flex items-baseline gap-1.5 py-0.5 pl-3 pr-5",
                running !== null && !runs && !drawing && "opacity-40",
                drawing && "bg-fuchsia-100",
              )}
            >
              <span className={clsx("shrink-0 text-[10px] font-semibold uppercase", style.text)}>{armLabel(arm)}</span>
              {condition !== null && <code className="min-w-0 break-words font-mono text-[11px]">{condition}</code>}
              {runs && <span className="ml-auto shrink-0 text-[10px] font-medium text-fuchsia-800">runs now</span>}
              <Handle
                type="source"
                position={Position.Right}
                id={arm}
                title={`Draw a line to the top of a step to put it in the ${armLabel(arm)} arm`}
                onMouseDown={noTextSelection}
                style={{ backgroundColor: style.line }}
                className="!h-3 !w-3 !border-2 !border-white"
              />
            </li>
          );
        })}
      </ul>
      {/* The parameters it reads come in on the left. */}
      <Handle type="target" position={Position.Left} id="params" isConnectable={false} className="!h-2 !w-2 !bg-fuchsia-400" />
    </section>
  );
};

export default BranchNode;

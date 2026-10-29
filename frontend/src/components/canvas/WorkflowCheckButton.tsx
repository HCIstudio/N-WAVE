// The workflow check in the bottom bar: how many problems there are, and the
// list of them (each one can show its node).

import { AlertTriangle, CheckCircle2, Loader, RefreshCw, XCircle } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export interface CheckProblem {
  id: string;
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  system?: boolean;
}

interface WorkflowCheckButtonProps {
  problems: CheckProblem[];
  /** Node labels by ID, to name each problem's node. */
  nodeLabels: Record<string, string>;
  onShowNode: (nodeId: string) => void;
  /** Ask the server again (Docker, Nextflow); none without a server. */
  onRecheck?: () => void;
  isChecking: boolean;
  /** Whether problems keep the workflow from running (false: they only warn). */
  blocking?: boolean;
}

const WorkflowCheckButton: React.FC<WorkflowCheckButtonProps> = ({
  problems,
  nodeLabels,
  onShowNode,
  onRecheck,
  isChecking,
  blocking = true,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const errors = problems.filter((problem) => problem.level === "error").length;
  const warnings = problems.length - errors;

  // Closes on Escape and on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const summary =
    problems.length === 0
      ? "No problems found"
      : [
          errors > 0 &&
            `${errors} problem${errors > 1 ? "s" : ""}${blocking ? " to fix before running" : ""}`,
          warnings > 0 && `${warnings} warning${warnings > 1 ? "s" : ""}`,
        ]
          .filter(Boolean)
          .join(", ");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`Workflow check: ${summary}`}
        title={`Workflow check: ${summary}`}
        className="flex items-center gap-1 rounded-md p-1.5 text-xs font-medium hover:bg-accent"
      >
        {errors > 0 ? (
          <XCircle className="h-4 w-4 text-red-500" aria-hidden />
        ) : warnings > 0 ? (
          <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-nextflow-green" aria-hidden />
        )}
        {problems.length > 0 && <span>{problems.length}</span>}
      </button>

      {open && (
        <section
          aria-label="Workflow check"
          className="absolute bottom-full right-0 mb-3 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-panel-border bg-background p-3 text-text shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Workflow check</h2>
            {onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              disabled={isChecking}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-light hover:bg-accent disabled:opacity-50"
              title="Ask the server again whether Docker and Nextflow are available"
            >
              {isChecking ? (
                <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              Check again
            </button>
            )}
          </div>
          {problems.length === 0 ? (
            <p className="text-sm text-text-light">
              Nothing to fix: the workflow is ready to run.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-text-light">
                {errors > 0 && blocking
                  ? "Fix the problems marked red to run the workflow; warnings don't stop it."
                  : errors > 0
                    ? "The problems marked red will likely make the run fail, but you can run anyway."
                    : "The workflow can run; these may not be what you want."}
              </p>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                {problems.map((problem) => (
                  <li
                    key={problem.id}
                    className="flex items-start gap-2 rounded-md bg-accent/50 p-2 text-sm"
                  >
                    {problem.level === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-label="Problem" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-label="Warning" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p>{problem.message}</p>
                      {problem.nodeId && nodeLabels[problem.nodeId] !== undefined && (
                        <button
                          type="button"
                          onClick={() => {
                            onShowNode(problem.nodeId as string);
                            setOpen(false);
                          }}
                          className="mt-1 text-xs text-nextflow-green hover:underline"
                        >
                          Show “{nodeLabels[problem.nodeId]}”
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default WorkflowCheckButton;

// The workflow's analysis (Analyse in the bottom bar): what nextflow lint and
// BioFlow-Insight found in its code, and steps that belong together. Its
// structure is drawn by the graph views (Specification graph, Process
// dependency graph), which this opens.

import type { Node } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, Info, Loader, Network, RefreshCw, Share2, X, XCircle } from "lucide-react";
import type React from "react";
import { useEffect, useId, useMemo } from "react";
import { type AnalysisPart, analysisProblems } from "../../analysis/analysis";
import { BIOFLOW_PAPER_URL } from "../../analysis/bioflow";
import { wikiUrl } from "../../docs/links";
import type { GraphKind } from "../../analysis/graphViews";
import { useAnalysisProgress } from "../../analysis/useAnalysisProgress";
import AnalysisProgress from "./AnalysisProgress";
import type { WorkflowAnalysisState } from "../../analysis/useWorkflowAnalysis";
import type { NodeData } from "../nodes/BaseNode";
import { groupSuggestions, SUGGESTION_REASONS } from "../../groups/suggestions";

const PartStatus: React.FC<{ part: AnalysisPart<unknown>; name: string }> = ({
  part,
  name,
}) =>
  part.status === "done" ? null : (
    <p className="flex items-start gap-1.5 text-sm text-text-light">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {name} {part.status === "unavailable" ? "isn't available" : "failed"}:{" "}
        {part.reason}
      </span>
    </p>
  );

interface AnalysisPanelProps {
  state: WorkflowAnalysisState;
  nodes: Node<NodeData>[];
  workflowName: string;
  nodeLabels: Record<string, string>;
  onShowNode: (nodeId: string) => void;
  /** Group the steps of a suggestion (absent: can't be changed now). */
  onGroup?: (ids: string[]) => void;
  /** Opens a graph view of the code. */
  onOpenView: (kind: GraphKind) => void;
  onClose: () => void;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  state,
  nodes,
  workflowName,
  nodeLabels,
  onShowNode,
  onGroup,
  onOpenView,
  onClose,
}) => {
  const headingId = useId();
  const progress = useAnalysisProgress(state.running);
  const { analysis, current, running, error, analyse } = state;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const problems = useMemo(
    () => (analysis ? analysisProblems(analysis, nodes) : []),
    [analysis, nodes],
  );
  const bioflow =
    analysis?.bioflow.status === "done" ? analysis.bioflow.result : null;
  // Steps that belong together, by BioFlow-Insight (only while the steps are as analysed).
  const suggestions = useMemo(
    () =>
      bioflow && analysis && state.structureCurrent
        ? groupSuggestions(bioflow, analysis.names, nodes)
        : [],
    [bioflow, analysis, state.structureCurrent, nodes],
  );

  const errors = problems.filter((problem) => problem.level === "error").length;
  const warnings = problems.length - errors;
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/50 p-4 sm:p-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-panel-border bg-panel-background shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-panel-border px-4 py-3">
          <h2 id={headingId} className="text-lg font-semibold text-text">
            Analysis of {workflowName || "the workflow"}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void analyse()}
              disabled={running}
              className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-sm text-text hover:bg-accent disabled:opacity-60"
            >
              {running ? (
                <Loader className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Analyse again
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the analysis"
              className="rounded p-1 text-text-light hover:bg-accent hover:text-text"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {progress && (
              <div className="mb-4 rounded-md border border-panel-border p-3">
                <AnalysisProgress progress={progress} />
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </p>
            )}
            {analysis && !current && (
              <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                The workflow changed since this analysis. Analyse again to check
                it as it is.
              </p>
            )}
            {analysis && (
              <>
                <h3 className="mb-2 text-sm font-semibold text-text">
                  Code check
                </h3>
                <div className="space-y-2">
                  <PartStatus part={analysis.lint} name="nextflow lint" />
                  <PartStatus part={analysis.bioflow} name="BioFlow-Insight" />
                  {(analysis.lint.status === "done" ||
                    analysis.bioflow.status === "done") &&
                    problems.length === 0 && (
                      <p className="flex items-center gap-1.5 text-sm text-text">
                        <CheckCircle2
                          className="h-4 w-4 text-green-600"
                          aria-hidden
                        />{" "}
                        No problems found in the code.
                      </p>
                    )}
                  {problems.length > 0 && (
                    <>
                      <p className="text-sm text-text">
                        {errors > 0 &&
                          `${errors} error${errors === 1 ? "" : "s"}`}
                        {errors > 0 && warnings > 0 && ", "}
                        {warnings > 0 &&
                          `${warnings} warning${warnings === 1 ? "" : "s"}`}
                        . They are in the workflow check too; they don&apos;t
                        keep the workflow from running.
                      </p>
                      <ul
                        aria-label="Problems in the code"
                        className="space-y-2"
                      >
                        {problems.map((problem) => (
                          <li
                            key={problem.id}
                            className="flex items-start gap-1.5 text-sm text-text"
                          >
                            {problem.level === "error" ? (
                              <XCircle
                                className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                                aria-label="Error"
                              />
                            ) : (
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                aria-label="Warning"
                              />
                            )}
                            <span>
                              {problem.message}
                              {problem.nodeId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onShowNode(problem.nodeId as string)
                                  }
                                  className="ml-1 text-primary hover:underline"
                                >
                                  Show “
                                  {nodeLabels[problem.nodeId] ?? problem.nodeId}
                                  ”
                                </button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {bioflow && (
                  <>
                    <h3 className="mb-2 mt-4 text-sm font-semibold text-text">
                      Its structure
                    </h3>
                    <p className="mb-2 text-sm text-text-light">
                      BioFlow-Insight&apos;s reading of the code, as read-only views
                      in place of the editor:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenView("specification")}
                        className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-sm text-text hover:bg-accent"
                      >
                        <Share2 className="h-4 w-4" aria-hidden /> Specification graph
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenView("dependencies")}
                        className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-sm text-text hover:bg-accent"
                      >
                        <Network className="h-4 w-4" aria-hidden /> Process dependency graph
                      </button>
                    </div>
                  </>
                )}
                {suggestions.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 text-sm font-semibold text-text">
                      Steps that belong together
                    </h3>
                    <ul
                      aria-label="Suggested groups"
                      className="space-y-2 text-sm text-text"
                    >
                      {suggestions.map((suggestion) => (
                        <li
                          key={suggestion.ids.join("|")}
                          className="rounded-md border border-panel-border p-2"
                        >
                          <p className="text-xs text-text-light">
                            {SUGGESTION_REASONS[suggestion.kind]}
                          </p>
                          <p>
                            {suggestion.ids
                              .map((id) => nodeLabels[id] ?? id)
                              .join(", ")}
                          </p>
                          {onGroup && (
                            <button
                              type="button"
                              onClick={() => onGroup(suggestion.ids)}
                              className="mt-1 rounded border border-panel-border px-2 py-0.5 text-xs hover:bg-accent"
                            >
                              Group into subworkflow…
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {bioflow && bioflow.notes.length > 0 && (
                  <ul className="mt-4 space-y-1 text-xs text-text-light">
                    {bioflow.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="border-t border-panel-border px-4 py-2 text-xs text-text-light">
          From the workflow&apos;s generated code, by{" "}
          <a
            href={BIOFLOW_PAPER_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text"
          >
            BioFlow-Insight (Marchment et al., 2024)
          </a>
          ; code check by nextflow lint. Both run on this installation, without
          network.{" "}
          <a
            href={wikiUrl({ page: "Workflow-Analysis" })}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text"
          >
            How it works
          </a>
        </footer>
      </section>
    </div>
  );
};

export default AnalysisPanel;

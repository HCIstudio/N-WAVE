// The open workflow's analysis (Analyse in the bottom bar): run on request,
// kept until the workflow's code changes. Its problems join the workflow
// check while it is current.

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { logActivity } from "../activity/activityLog";
import type { NodeData } from "../components/nodes/BaseNode";
import type { WorkflowProblem } from "../pages/workflow/workflowCheck";
import {
  analyseWorkflow,
  analysisProblems,
  codeSignature,
  structureSignature,
  type WorkflowAnalysis,
} from "./analysis";

const NONE: WorkflowProblem[] = [];

export const useWorkflowAnalysis = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflowName: string,
) => {
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  const [analysedSignature, setAnalysedSignature] = useState<string | null>(
    null,
  );
  const [analysedStructure, setAnalysedStructure] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const signature = useMemo(() => codeSignature(nodes, edges), [nodes, edges]);
  const current = analysis !== null && analysedSignature === signature;
  // Changing a parameter's value changes the code, not which steps there are
  // and the conditions they're called under.
  const structure = useMemo(() => structureSignature(nodes, edges), [nodes, edges]);
  const structureCurrent = analysis !== null && analysedStructure === structure;

  const analyse = useCallback(async () => {
    const attempt = latest.current + 1;
    latest.current = attempt;
    setRunning(true);
    setError(null);
    const started = codeSignature(nodes, edges);
    const startedStructure = structureSignature(nodes, edges);
    try {
      const result = await analyseWorkflow(nodes, edges, workflowName);
      if (latest.current !== attempt) return;
      setAnalysis(result);
      setAnalysedSignature(started);
      setAnalysedStructure(startedStructure);
      const found = analysisProblems(result, nodes);
      logActivity("analysis.run", {
        lint: result.lint.status,
        bioflow: result.bioflow.status,
        errors: found.filter((problem) => problem.level === "error").length,
        warnings: found.filter((problem) => problem.level === "warning").length,
      });
    } catch (caught) {
      if (latest.current !== attempt) return;
      const message =
        caught instanceof Error
          ? caught.message
          : "The workflow could not be analysed.";
      setError(message);
      logActivity("analysis.run", { failed: true });
    } finally {
      if (latest.current === attempt) setRunning(false);
    }
  }, [nodes, edges, workflowName]);

  const problems = useMemo(
    () => (analysis && current ? analysisProblems(analysis, nodes) : NONE),
    [analysis, current, nodes],
  );

  return {
    analysis,
    /** The analysis is of the workflow as it is now. */
    current,
    /** The analysis is of the workflow's steps as they are now (parameter values aside). */
    structureCurrent,
    running,
    error,
    problems,
    analyse,
  };
};

export type WorkflowAnalysisState = ReturnType<typeof useWorkflowAnalysis>;

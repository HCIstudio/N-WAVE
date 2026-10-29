// The workflow check on the open workflow: it follows every change, and asks
// the server once (and on request) whether Docker and Nextflow are there and
// how much a run may use.

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import api, { isDemoMode } from "../../api";
import type { NodeData } from "../../components/nodes/BaseNode";
import type { NodeProblem } from "../../execution/NodeProblemsContext";
import { useFeature, useWorkflowCheckMode } from "../../settings/useFeatures";
import type { ExecutionSettings } from "../../types/execution";
import {
  checkWorkflow,
  type DockerStatus,
  type NextflowStatus,
  type ServerLimits,
  type WorkflowProblem,
} from "./workflowCheck";

interface ServerState {
  docker: DockerStatus | null;
  nextflow: NextflowStatus | null;
  limits: ServerLimits | null;
}

const UNKNOWN: ServerState = { docker: null, nextflow: null, limits: null };

/** Why Run is disabled, from the check's errors, or null. */
export const runBlockedReason = (problems: WorkflowProblem[]): string | null => {
  const errors = problems.filter((problem) => problem.level === "error");
  if (errors.length === 0) return null;
  const more = errors.length - 1;
  return `Can't run yet: ${errors[0].message}${
    more > 0 ? ` (and ${more} more problem${more > 1 ? "s" : ""}: see the check next to Run)` : ""
  }`;
};

interface Options {
  nodes: Node<NodeData>[];
  edges: Edge[];
  settings: ExecutionSettings;
  missingNfCoreComponents: string[];
}

export const useWorkflowCheck = ({ nodes, edges, settings, missingNfCoreComponents }: Options) => {
  const [server, setServer] = useState<ServerState>(UNKNOWN);
  const [isChecking, setIsChecking] = useState(false);
  // Global Settings → Features: block on problems, only warn, or no check;
  // without connection hints, ports that don't fit aren't reported either.
  const mode = useWorkflowCheckMode();
  const hintsOn = useFeature("connectionHints");

  // The demo has no server to run on (it says so when Run is pressed).
  const recheck = useCallback(async () => {
    if (isDemoMode) return;
    setIsChecking(true);
    const settle = <T,>(request: Promise<{ data: T }>) =>
      request.then(
        (response) => response.data,
        () => null,
      );
    const [docker, nextflow, limits] = await Promise.all([
      settle(api.get<DockerStatus>("/execute/docker-status")),
      settle(api.get<NextflowStatus>("/execute/nextflow-status")),
      settle(api.get<ServerLimits>("/execute/limits")),
    ]);
    setServer({ docker, nextflow, limits });
    setIsChecking(false);
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const problems = useMemo(
    () =>
      mode === "off"
        ? []
        : checkWorkflow(nodes, edges, { missingNfCoreComponents, settings, ...server }).filter(
            (problem) => hintsOn || !problem.id.startsWith("fit:"),
          ),
    [nodes, edges, missingNfCoreComponents, settings, server, mode, hintsOn],
  );

  // Nodes re-render when their problems change, not on every edit (a drag).
  const nodeProblemsKey = useMemo(() => {
    const byNode: Record<string, NodeProblem[]> = {};
    for (const { nodeId, level, message } of problems) {
      if (nodeId) byNode[nodeId] = [...(byNode[nodeId] ?? []), { level, message }];
    }
    return JSON.stringify(byNode);
  }, [problems]);
  const nodeProblems = useMemo(
    () => JSON.parse(nodeProblemsKey) as Record<string, NodeProblem[]>,
    [nodeProblemsKey],
  );

  return {
    problems,
    nodeProblems,
    blockedReason: mode === "block" ? runBlockedReason(problems) : null,
    mode,
    recheck,
    isChecking,
  };
};

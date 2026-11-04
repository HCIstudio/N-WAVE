// "Analyse" a workflow: its generated Nextflow code is checked with
// `nextflow lint` and analysed with BioFlow-Insight (POST /api/analysis), and
// what they find becomes problems of the workflow check, on the node whose
// code they're in.

import type { Edge, Node } from "@xyflow/react";
import api, { isDemoMode } from "../api";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import type { WorkflowProblem } from "../pages/workflow/workflowCheck";
import { getApiErrorMessage } from "../utils/errors";
import type { BioflowResult } from "./bioflow";
import { analysisKeyText, DEMO_NOT_RECORDED, sha256Hex } from "./demoAnalysis";
import { type LineOwners, lineOwners } from "./scriptLines";

export interface LintProblem {
  level: "error" | "warning";
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface LintResult {
  tool: { name: string; image: string };
  files: string[];
  problems: LintProblem[];
}

/** One tool's part: its result, or why there is none. */
export type AnalysisPart<T> =
  | { status: "done"; result: T }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

export interface AnalysisResponse {
  lint: AnalysisPart<LintResult>;
  bioflow: AnalysisPart<BioflowResult>;
}

export interface WorkflowAnalysis extends AnalysisResponse {
  /** The script that was analysed, and which node wrote each of its lines. */
  script: string;
  owners: LineOwners;
  /** The node each name in the script is (process, call or channel name). */
  names: Map<string, string>;
}

/** Generate the workflow's script and analyse it. Throws when it can't be sent. */
export const analyseWorkflow = async (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflowName: string,
): Promise<WorkflowAnalysis> => {
  const { script, names } = generateNextflowScriptWithNames(
    nodes,
    edges,
    workflowName || "workflow",
    "results",
  );
  const owners = lineOwners(script, names, nodes);
  if (isDemoMode) {
    // The built-in examples, analysed when the demo was built.
    const recorded = (await import("../demo/analysisResults.json"))
      .default as unknown as Record<string, AnalysisResponse>;
    const found = recorded[await sha256Hex(analysisKeyText(script))];
    const unavailable = {
      status: "unavailable",
      reason: DEMO_NOT_RECORDED,
    } as const;
    return found
      ? { ...found, script, owners, names }
      : { script, owners, names, lint: unavailable, bioflow: unavailable };
  }
  try {
    const { data } = await api.post<AnalysisResponse>(
      "/analysis",
      { nextflowScript: script },
      { timeout: 10 * 60_000 },
    );
    return { ...data, script, owners, names };
  } catch (caught) {
    throw new Error(
      getApiErrorMessage(caught, "The workflow could not be analysed."),
    );
  }
};

const nfCoreFile = /^(modules|subworkflows)\/nf-core\/(.+)\/main\.nf$/;

/** The node a file of the analysed project belongs to: an nf-core component's file → its node. */
const nodeOfFile = (
  file: string,
  nodes: Node<NodeData>[],
): string | undefined => {
  const match = nfCoreFile.exec(file);
  if (!match) return undefined;
  const id = `nf-core/${match[1] === "subworkflows" ? "subworkflows/" : ""}${match[2]}`;
  return nodes.find((node) => node.data.nwaveNfCoreModuleId === id)?.id;
};

/**
 * What the analysis found, as workflow-check problems. They are advisory:
 * shown, never blocking a run (lint is stricter than the Nextflow that runs).
 */
export const analysisProblems = (
  analysis: WorkflowAnalysis,
  nodes: Node<NodeData>[],
): WorkflowProblem[] => {
  const problems: WorkflowProblem[] = [];
  if (analysis.lint.status === "done") {
    for (const found of analysis.lint.result.problems) {
      const nodeId =
        found.file === "main.nf"
          ? analysis.owners.get(found.line)
          : nodeOfFile(found.file, nodes);
      const where =
        found.file === "main.nf"
          ? `line ${found.line}`
          : `${found.file}, line ${found.line}`;
      problems.push({
        id: `lint:${found.file}:${found.line}:${found.column}:${found.message}`,
        level: found.level,
        message: `${found.message} (nextflow lint, ${where})`,
        nodeId,
        advisory: true,
      });
    }
  }
  const lintFoundErrors = problems.some((problem) => problem.level === "error");
  if (analysis.bioflow.status === "done" && analysis.bioflow.result.error) {
    const { error } = analysis.bioflow.result;
    // "Nextflow's parser found an error" says what lint said, without where.
    if (error.code === "ewlsif" && lintFoundErrors) return problems;
    const nodeId =
      error.file && error.file !== "main.nf"
        ? nodeOfFile(error.file, nodes)
        : undefined;
    problems.push({
      id: `bioflow:${error.code}`,
      level: "error",
      message: `${error.message} (BioFlow-Insight${error.file ? `, ${error.file}` : ""})`,
      nodeId,
      advisory: true,
    });
  }
  return problems;
};

/** What changes the generated code: nodes' types and settings, and the connections (not positions). */
export const codeSignature = (nodes: Node<NodeData>[], edges: Edge[]): string =>
  JSON.stringify([
    nodes.map((node) => [node.id, node.type, node.data]),
    edges.map((edge) => [
      edge.source,
      edge.sourceHandle,
      edge.target,
      edge.targetHandle,
    ]),
  ]);

/**
 * What changes the workflow's structure: as codeSignature, without the
 * Parameters nodes' values (which change when a step runs, not which steps
 * there are and where they're called).
 */
export const structureSignature = (nodes: Node<NodeData>[], edges: Edge[]): string =>
  codeSignature(
    nodes.map((node) =>
      node.type === "parameters"
        ? {
            ...node,
            data: {
              ...node.data,
              parameters: Array.isArray(node.data.parameters)
                ? (node.data.parameters as Array<{ name?: unknown; type?: unknown }>).map(({ name, type }) => ({ name, type }))
                : node.data.parameters,
            },
          }
        : node,
    ),
    edges,
  );


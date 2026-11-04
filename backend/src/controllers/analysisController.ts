import type { Request, Response } from "express";
import { buildAnalysisProject } from "../analysis/bioflowProject";
import type { BioflowResult } from "../analysis/bioflowResult";
import {
  BioflowUnavailableError,
  getBioflowStatus,
  runBioflowAnalysis,
} from "../analysis/bioflowRunner";
import {
  getLintStatus,
  type LintResult,
  LintUnavailableError,
  runNextflowLint,
} from "../analysis/lintRunner";
import { NfCoreLibraryError } from "../nfcore/library";
import { getErrorMessage } from "../utils/errors";
import { bioflowAnalysisSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";

/** One tool's part of an analysis: its result, or why there is none. */
type Part<T> =
  | { status: "done"; result: T }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

const settle = async <T>(
  run: () => Promise<T>,
  Unavailable: new (...args: never[]) => Error
): Promise<Part<T>> => {
  try {
    return { status: "done", result: await run() };
  } catch (error: unknown) {
    return error instanceof Unavailable
      ? { status: "unavailable", reason: error.message }
      : { status: "failed", reason: getErrorMessage(error) };
  }
};

/** GET /api/analysis: which of the analysis's tools run here. */
export const getAnalysisStatus = async (_req: Request, res: Response): Promise<void> => {
  const [lint, bioflow] = await Promise.all([getLintStatus(), getBioflowStatus()]);
  res.json({ lint, bioflow });
};

/**
 * POST /api/analysis: check a workflow's script with `nextflow lint` and
 * analyse it with BioFlow-Insight, both on the same project, side by side.
 * Each part says whether it ran; neither failing fails the request.
 */
export const analyseWorkflow = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(bioflowAnalysisSchema, req, res);
  if (!body) return;
  let project: Awaited<ReturnType<typeof buildAnalysisProject>>;
  try {
    project = await buildAnalysisProject(body.nextflowScript, body.files);
  } catch (error: unknown) {
    const status = error instanceof NfCoreLibraryError ? error.status : 500;
    res.status(status).json({ message: getErrorMessage(error) });
    return;
  }
  const [lint, bioflow] = await Promise.all([
    settle<LintResult>(() => runNextflowLint(project), LintUnavailableError),
    settle<BioflowResult>(() => runBioflowAnalysis(project), BioflowUnavailableError),
  ]);
  res.json({ lint, bioflow });
};

/** GET /api/analysis/bioflow: whether workflows can be analysed here. */
export const getBioflowAnalysisStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getBioflowStatus());
};

/**
 * POST /api/analysis/bioflow: analyse a workflow's script with
 * BioFlow-Insight (backend/bioflow). 503 when the analysis isn't available.
 */
export const analyseWithBioflow = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(bioflowAnalysisSchema, req, res);
  if (!body) return;
  try {
    const project = await buildAnalysisProject(body.nextflowScript, body.files);
    res.json({ result: await runBioflowAnalysis(project) });
  } catch (error: unknown) {
    if (error instanceof BioflowUnavailableError) {
      res.status(503).json({ message: error.message });
      return;
    }
    if (error instanceof NfCoreLibraryError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: getErrorMessage(error) });
  }
};

import type { Request, Response } from "express";
import { buildAnalysisProject } from "../analysis/bioflowProject";
import {
  BioflowUnavailableError,
  getBioflowStatus,
  runBioflowAnalysis,
} from "../analysis/bioflowRunner";
import { NfCoreLibraryError } from "../nfcore/library";
import { getErrorMessage } from "../utils/errors";
import { bioflowAnalysisSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";

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

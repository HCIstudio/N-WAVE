import type { Request, Response } from "express";
import { NfCoreLibraryError } from "../nfcore/library";
import { getPipelineSchema } from "../pipelines/schema";
import { getErrorMessage } from "../utils/errors";

/** `{ name, version, schema }`: a pipeline's nextflow_schema.json. */
export const getPipelineSchemaHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const name = typeof req.query.name === "string" ? req.query.name : "";
  const version =
    typeof req.query.version === "string" ? req.query.version : "";
  try {
    res.json({ name, version, schema: await getPipelineSchema(name, version) });
  } catch (error: unknown) {
    if (error instanceof NfCoreLibraryError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    res.status(502).json({
      message: "Failed to load the pipeline schema",
      error: getErrorMessage(error),
    });
  }
};

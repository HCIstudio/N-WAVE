import type { Request, Response } from "express";
import { NfCoreLibraryError } from "../nfcore/library";
import { getPipelineCatalog } from "../pipelines/catalog";
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

/** `{ pipelines, fetchedAt, stale? }`: the nf-core pipelines and their releases. */
export const listPipelinesHandler = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    res.json(await getPipelineCatalog());
  } catch (error: unknown) {
    res.status(502).json({
      message: "Could not load the list of nf-core pipelines from nf-co.re",
      error: getErrorMessage(error),
    });
  }
};

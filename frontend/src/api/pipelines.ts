import api from "../api";
import type { PipelineCatalog } from "../registry/pipelines/catalog";

/** nf-core/<name>'s `nextflow_schema.json` at a release (or branch). */
export const getPipelineSchema = async (
  name: string,
  version: string,
): Promise<unknown> => {
  const response = await api.get<{ schema: unknown }>(
    `/pipelines/schema?name=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}`,
  );
  return response.data.schema;
};

/** The nf-core pipelines and their releases (from nf-co.re). */
export const listPipelines = async (): Promise<PipelineCatalog> => {
  const response = await api.get<PipelineCatalog>("/pipelines");
  return response.data;
};

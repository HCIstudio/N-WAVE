import api from "../api";

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

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { NfCoreLibraryError } from "../nfcore/library";

// nf-core pipeline schemas (`nextflow_schema.json`), downloaded from GitHub
// at the requested release and cached under the N-WAVE data dir. The
// frontend builds the Pipeline node's settings form from them.

export const PIPELINE_NAME = /^[a-z0-9][a-z0-9_-]*$/;
export const PIPELINE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const schemaUrl = (name: string, version: string): string =>
  `https://raw.githubusercontent.com/nf-core/${name}/${version}/nextflow_schema.json`;

const cachePath = (name: string, version: string): string =>
  path.join(getNwaveDataRoot(), "pipelines", name, version, "nextflow_schema.json");

/** The schema of nf-core/<name> at <version> (a release tag or branch). */
export const getPipelineSchema = async (
  name: string,
  version: string,
): Promise<unknown> => {
  if (!PIPELINE_NAME.test(name) || !PIPELINE_VERSION.test(version)) {
    throw new NfCoreLibraryError(400, "Invalid pipeline name or version");
  }
  const cached = cachePath(name, version);
  if (fs.existsSync(cached)) {
    return JSON.parse(fs.readFileSync(cached, "utf8"));
  }

  let text: string;
  try {
    const response = await axios.get<string>(schemaUrl(name, version), {
      responseType: "text",
      transformResponse: [(data) => data],
      headers: { "User-Agent": "N-WAVE-pipelines" },
    });
    text = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new NfCoreLibraryError(
        404,
        `nf-core/${name} ${version} has no nextflow_schema.json (check the pipeline name and version).`,
      );
    }
    throw error;
  }
  const schema: unknown = JSON.parse(text);
  // Branches move; only releases are cached.
  if (/^\d+(\.\d+)*$/.test(version)) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, text);
  }
  return schema;
};

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { NfCoreLibraryError } from "../nfcore/library";
import { PIPELINE_NAME, PIPELINE_VERSION } from "./schema";

// The workflow files of an nf-core pipeline (main.nf, workflows/, subworkflows/),
// downloaded from GitHub at a release and cached like the schema. The canvas
// reads them to show the steps inside a Pipeline node.

/** Only Nextflow files of the pipeline's own workflows, never a path out of it. */
export const WORKFLOW_FILE = /^(main\.nf|(workflows|subworkflows)\/[A-Za-z0-9_][A-Za-z0-9_./-]*\.nf)$/;

const fileUrl = (name: string, version: string, file: string): string =>
  `https://raw.githubusercontent.com/nf-core/${name}/${version}/${file}`;

const cachePath = (name: string, version: string, file: string): string =>
  path.join(getNwaveDataRoot(), "pipelines", name, version, "files", ...file.split("/"));

export const getPipelineWorkflowFile = async (
  name: string,
  version: string,
  file: string,
): Promise<string> => {
  if (!PIPELINE_NAME.test(name) || !PIPELINE_VERSION.test(version)) {
    throw new NfCoreLibraryError(400, "Invalid pipeline name or version");
  }
  if (!WORKFLOW_FILE.test(file) || file.split("/").includes("..")) {
    throw new NfCoreLibraryError(400, "Only the pipeline's main.nf, workflows/ and subworkflows/ can be read");
  }
  const cached = cachePath(name, version, file);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");

  let text: string;
  try {
    const response = await axios.get<string>(fileUrl(name, version, file), {
      responseType: "text",
      transformResponse: [(data) => data],
      headers: { "User-Agent": "N-WAVE-pipelines" },
      timeout: 30_000,
    });
    text = response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new NfCoreLibraryError(404, `nf-core/${name} ${version} has no ${file}.`);
    }
    throw error;
  }
  // Branches move; only releases are cached.
  if (/^\d+(\.\d+)*$/.test(version)) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, text);
  }
  return text;
};

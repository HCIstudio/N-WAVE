import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { PIPELINE_NAME, PIPELINE_VERSION } from "./schema";

/**
 * The oldest Nextflow a pipeline accepts, from `manifest.nextflowVersion`
 * in its nextflow.config (e.g. `'!>=25.10.4'`; "!" makes it a hard
 * requirement). nf-core/rnaseq 3.27.0 needs 25.10.4: older versions can't
 * load its nf-schema plugin.
 */
export const parseNextflowRequirement = (config: string): string | null =>
  config.match(/nextflowVersion\s*=\s*['"]!?\s*>=\s*(\d+(?:\.\d+){1,2})/)?.[1] ??
  null;

const parts = (version: string): number[] =>
  version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);

/** Negative when a < b, like a comparator. "25.10.4" vs "25.04.4". */
export const compareNextflowVersions = (a: string, b: string): number => {
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/** The selected version, or the pipeline's minimum when that is newer. */
export const resolvePipelineNextflowVersion = (
  selected: string,
  required: string | null,
): string =>
  required && compareNextflowVersions(selected, required) < 0 ? required : selected;

const configUrl = (name: string, version: string): string =>
  `https://raw.githubusercontent.com/nf-core/${name}/${version}/nextflow.config`;

/**
 * The minimum Nextflow version nf-core/<name> at <version> declares, or null
 * when it declares none or can't be read (the run then uses the selected
 * version, as before). Releases are cached like their schemas.
 */
export const getPipelineNextflowRequirement = async (
  name: string,
  version: string,
): Promise<string | null> => {
  if (!PIPELINE_NAME.test(name) || !PIPELINE_VERSION.test(version)) return null;
  const cached = path.join(
    getNwaveDataRoot(),
    "pipelines",
    name,
    version,
    "nextflow.config",
  );
  if (fs.existsSync(cached)) {
    return parseNextflowRequirement(fs.readFileSync(cached, "utf8"));
  }
  try {
    const response = await axios.get<string>(configUrl(name, version), {
      responseType: "text",
      transformResponse: [(data) => data],
      headers: { "User-Agent": "N-WAVE-pipelines" },
      timeout: 15_000,
    });
    if (/^\d+(\.\d+)*$/.test(version)) {
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, response.data);
    }
    return parseNextflowRequirement(response.data);
  } catch {
    return null;
  }
};

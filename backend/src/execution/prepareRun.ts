// The files a run needs before Nextflow starts: the script and its config,
// or a pipeline's params, plus the nf-core components the script uses.

import fs from "node:fs";
import path from "node:path";
import {
  ensureModulesInstalled,
  ensureSubworkflowsInstalled,
} from "../nfcore/library";
import type { PipelineRunRequest } from "../validation/schemas";
import { materializeNfCoreModules } from "./materializeNfCore";
import {
  buildExecutionConfig,
  extractNwaveNextflowAssets,
  getReferencedNfCoreModules,
  getReferencedNfCoreSubworkflows,
} from "./nextflowScript";
import type { RunDirectories } from "./runDirectory";

export const MODULE_CONFIG_FILE = "nwave_modules.config";

export interface PreparedRun {
  /** The run uses nf-core modules or subworkflows (or is a pipeline). */
  hasNfCoreModules: boolean;
  /** Tasks run in Docker containers. */
  useProcessDocker: boolean;
}

/** A whole nf-core pipeline: Nextflow pulls it; its tasks run in containers. */
export const preparePipelineRun = (
  dirs: RunDirectories,
  pipeline: PipelineRunRequest,
  resourceConfig: string
): PreparedRun => {
  fs.writeFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), `${resourceConfig}\n`);
  if (Object.keys(pipeline.params).length > 0) {
    fs.writeFileSync(
      path.join(dirs.main, "params.json"),
      `${JSON.stringify(pipeline.params, null, 2)}\n`
    );
  }
  return { hasNfCoreModules: true, useProcessDocker: true };
};

/**
 * A generated (or imported) script: written with its config, and the
 * nf-core components it uses installed (from the catalog's pinned commit)
 * and copied next to it.
 */
export const prepareScriptRun = async (
  dirs: RunDirectories,
  scriptPath: string,
  nextflowScript: string,
  options: { useDocker: boolean; resourceConfig: string }
): Promise<PreparedRun> => {
  const assets = extractNwaveNextflowAssets(nextflowScript);
  const modules = getReferencedNfCoreModules(assets.script);
  const subworkflows = getReferencedNfCoreSubworkflows(assets.script);
  const hasNfCoreModules = modules.length > 0 || subworkflows.length > 0;
  const useProcessDocker = options.useDocker || hasNfCoreModules;
  const config = `${[
    buildExecutionConfig(assets.config, useProcessDocker),
    options.resourceConfig,
  ]
    .filter((block) => block.trim() !== "")
    .join("\n\n")}\n`;

  fs.writeFileSync(scriptPath, assets.script);
  fs.writeFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), config);
  fs.writeFileSync(path.join(dirs.workflow, MODULE_CONFIG_FILE), config);

  await ensureModulesInstalled(modules);
  await ensureSubworkflowsInstalled(subworkflows);
  materializeNfCoreModules(assets.script, [dirs.main, dirs.workflow]);
  return { hasNfCoreModules, useProcessDocker };
};

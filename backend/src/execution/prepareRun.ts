// The files a run needs before Nextflow starts: the script and its config,
// or a pipeline's params, plus the nf-core components the script uses.

import fs from "node:fs";
import path from "node:path";
import {
  ensureModulesInstalled,
  ensureSubworkflowsInstalled,
  type InstallOptions,
} from "../nfcore/library";
import type { PipelineRunRequest } from "../validation/schemas";
import { buildRunProfileConfig, profileUsesDocker, type RunProfile } from "./runProfile";
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
  resourceConfig: string,
  profile?: RunProfile
): PreparedRun => {
  const config = [resourceConfig, ...(profile ? [buildRunProfileConfig(profile)] : [])].join("\n\n");
  fs.writeFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), `${config}\n`);
  const paramsFile = path.join(dirs.main, "params.json");
  if (Object.keys(pipeline.params).length > 0) {
    fs.writeFileSync(paramsFile, `${JSON.stringify(pipeline.params, null, 2)}\n`);
  } else {
    // A resumed run's folder may still have the last run's params.
    fs.rmSync(paramsFile, { force: true });
  }
  return { hasNfCoreModules: true, useProcessDocker: profile ? profileUsesDocker(profile) : true };
};

/**
 * The script and config a run of `nextflowScript` uses: N-WAVE's config
 * blocks moved out of the script, and the server's resource limits added.
 */
export const buildScriptRunFiles = (
  nextflowScript: string,
  options: { useDocker: boolean; resourceConfig: string; profile?: RunProfile }
) => {
  const assets = extractNwaveNextflowAssets(nextflowScript);
  const modules = getReferencedNfCoreModules(assets.script);
  const subworkflows = getReferencedNfCoreSubworkflows(assets.script);
  const hasNfCoreModules = modules.length > 0 || subworkflows.length > 0;
  // A run profile chooses the containers; it goes last, so it wins.
  const useProcessDocker = options.profile
    ? profileUsesDocker(options.profile)
    : options.useDocker || hasNfCoreModules;
  const config = `${[
    buildExecutionConfig(assets.config, useProcessDocker),
    options.resourceConfig,
    options.profile ? buildRunProfileConfig(options.profile) : "",
  ]
    .filter((block) => block.trim() !== "")
    .join("\n\n")}\n`;
  return {
    script: assets.script,
    config,
    modules,
    subworkflows,
    prepared: { hasNfCoreModules, useProcessDocker } as PreparedRun,
  };
};

/**
 * A generated (or imported) script: written with its config, and the
 * nf-core components it uses installed (from the catalog's pinned commit)
 * and copied next to it. `install` reports each install and can stop them.
 */
export const prepareScriptRun = async (
  dirs: RunDirectories,
  scriptPath: string,
  nextflowScript: string,
  options: { useDocker: boolean; resourceConfig: string; profile?: RunProfile },
  install: InstallOptions = {}
): Promise<PreparedRun> => {
  const run = buildScriptRunFiles(nextflowScript, options);
  fs.writeFileSync(scriptPath, run.script);
  fs.writeFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), run.config);
  fs.writeFileSync(path.join(dirs.workflow, MODULE_CONFIG_FILE), run.config);

  await ensureModulesInstalled(run.modules, install);
  await ensureSubworkflowsInstalled(run.subworkflows, install);
  materializeNfCoreModules(run.script, [dirs.main, dirs.workflow]);
  return run.prepared;
};

import type { RunProfile } from "../execution/runProfiles";

// Where Nextflow runs.
export enum ExecutionMode {
  LOCAL = "local", // Use local Nextflow installation
  DOCKER = "docker", // Use Docker containers for processes
}

// A workflow's execution settings. Saved workflows may still carry fields
// older versions had (validation, retries, ...); they are ignored.
export interface ExecutionSettings {
  // Settings format version; settings saved before versions have none.
  version?: number;

  /**
   * Run profiles kept in the workflow itself, from before they moved to the
   * Settings page; they are offered next to those (see execution/runProfiles.ts).
   */
  runProfiles?: RunProfile[];
  /**
   * The profile runs from N-WAVE use. Unset: the default from the Settings
   * page; "" (THIS_COMPUTER): this computer with the settings below.
   */
  runProfile?: string;

  // Core execution mode
  mode: ExecutionMode;

  nextflow: {
    version: string;
  };

  container: {
    enabled: boolean;
    defaultImage: string;
  };

  resources: {
    /** False: this workflow's own limits below; otherwise those on the Settings page. */
    useDefaults?: boolean;
    maxCpus: number;
    maxMemory: string;
    maxTime: string; // ISO 8601 duration format
    executor: "local" | "sge" | "slurm" | "aws" | "google";
    queue?: string;
  };

  output: {
    directory: string;
    namingPattern: string;
  };

  errorHandling: {
    strategy: "terminate" | "ignore" | "retry" | "finish";
  };

  environment: {
    profile: string;
  };

  cleanup: {
    onFailure: boolean;
  };
}

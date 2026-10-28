import type { RunProfile } from "../execution/runProfiles";

// Where Nextflow runs.
export enum ExecutionMode {
  LOCAL = "local", // Use local Nextflow installation
  DOCKER = "docker", // Use Docker containers for processes
}

// Enhanced execution settings with validation
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

  // Nextflow configuration
  nextflow: {
    version: string;
    forceVersion: boolean; // Override automatic version selection
    enableDsl2: boolean;
    enableTrace: boolean;
    enableTimeline: boolean;
    enableReport: boolean;
  };

  // Container configuration
  container: {
    enabled: boolean;
    defaultImage: string;
    registry: string;
    pullPolicy: "always" | "never" | "if-not-present";
    customRunOptions: string[];
  };

  // Resource allocation
  resources: {
    /** False: this workflow's own limits below; otherwise those on the Settings page. */
    useDefaults?: boolean;
    maxCpus: number;
    maxMemory: string;
    maxTime: string; // ISO 8601 duration format
    executor: "local" | "sge" | "slurm" | "aws" | "google";
    queue?: string;
  };

  // Output and publishing
  output: {
    directory: string;
    namingPattern: string;
    overwrite: boolean;
    keepWorkDir: boolean;
  };

  // Error handling and retry
  errorHandling: {
    strategy: "terminate" | "ignore" | "retry" | "finish";
    maxRetries: number;
    backoffStrategy: "exponential" | "linear" | "fixed";
    continueOnError: boolean;
  };

  // Environment and profiles
  environment: {
    profile: string;
    customParams: Record<string, unknown>;
    environmentVariables: Record<string, string>;
  };

  // Cleanup and maintenance
  cleanup: {
    onSuccess: boolean;
    onFailure: boolean;
    intermediateFiles: boolean;
    workDirectory: boolean;
  };

  // Validation and constraints
  validation: {
    requireContainer: boolean;
    allowMissingInputs: boolean;
    strictChannelTypes: boolean;
    enableTypeChecking: boolean;
  };
}

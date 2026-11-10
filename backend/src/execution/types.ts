// Flattened execution settings the frontend sends with POST /api/execute/execute.
export interface ExecutionSettings {
  useDocker: boolean;
  containerImage: string;
  outputDirectory: string;
  outputNaming: string;
  maxCpus: number;
  maxMemory: string;
  executionTimeout: number;
  /** What Nextflow does when a step fails (process.errorStrategy). */
  errorStrategy: "terminate" | "ignore" | "retry" | "finish";
  publishMode?: string;
  /** Delete the run's work directory (its cache) when it fails. */
  cleanupOnFailure: boolean;
  nextflowVersion?: string;
}

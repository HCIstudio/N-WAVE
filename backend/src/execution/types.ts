// Flattened execution settings the frontend sends with POST /api/execute/execute.
export interface ExecutionSettings {
  useDocker: boolean;
  containerImage: string;
  outputDirectory: string;
  outputNaming: string;
  maxCpus: number;
  maxMemory: string;
  executionTimeout: number;
  errorStrategy: string;
  publishMode?: string;
  cleanupOnFailure: boolean;
  nextflowVersion?: string;
}

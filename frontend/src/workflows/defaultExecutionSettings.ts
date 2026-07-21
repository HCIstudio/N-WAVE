// Default execution settings applied to workflows created or imported in the
// browser (new workflows, Nextflow imports, and the demo store all use this).
// Mirrors backend/src/workflows/defaultExecutionSettings.ts, which the backend
// still uses for its built-in workflow and as a materialize fallback.
export const defaultExecutionSettings = {
  mode: "docker",
  nextflow: {
    version: "25.04.4",
    forceVersion: false,
    enableDsl2: true,
    enableTrace: false,
    enableTimeline: false,
    enableReport: false,
  },
  output: {
    directory: "results",
    namingPattern: "{workflow_name}_{timestamp}",
    overwrite: false,
    keepWorkDir: false,
  },
  container: {
    enabled: true,
    defaultImage: "ubuntu:22.04",
    registry: "docker.io",
    pullPolicy: "if-not-present",
    customRunOptions: [],
  },
  resources: {
    maxCpus: 4,
    maxMemory: "4.GB",
    maxTime: "PT30M",
    executor: "local",
  },
  errorHandling: {
    strategy: "terminate",
    maxRetries: 0,
    backoffStrategy: "exponential",
    continueOnError: false,
  },
  environment: {
    profile: "standard",
    customParams: {},
    environmentVariables: {},
  },
  cleanup: {
    onSuccess: false,
    onFailure: false,
    intermediateFiles: false,
    workDirectory: false,
  },
  validation: {
    requireContainer: false,
    allowMissingInputs: false,
    strictChannelTypes: false,
    enableTypeChecking: false,
  },
};

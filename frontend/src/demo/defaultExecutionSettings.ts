// Default execution settings applied to workflows created in the browser-only
// demo. Mirrors backend/src/workflows/defaultExecutionSettings.ts so that a
// workflow authored in the hosted demo behaves the same once exported and run
// against a real backend.
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

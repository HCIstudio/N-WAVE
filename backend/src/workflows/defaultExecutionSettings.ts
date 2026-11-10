export const defaultExecutionSettings = {
  mode: "docker",
  nextflow: {
    version: "25.04.4",
  },
  output: {
    directory: "results",
    namingPattern: "{workflow_name}_{timestamp}",
  },
  container: {
    enabled: true,
    defaultImage: "ubuntu:22.04",
  },
  resources: {
    maxCpus: 4,
    maxMemory: "4.GB",
    // No limit of its own: the server's default applies (24 h unless set).
    maxTime: "",
    executor: "local",
  },
  errorHandling: {
    strategy: "terminate",
  },
  environment: {
    profile: "standard",
  },
  cleanup: {
    onFailure: false,
  },
};

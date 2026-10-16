// A workflow's execution settings: the defaults, the copy kept in browser
// storage (shared with the bottom bar's settings dialog) and the flat shape
// the execute endpoint takes.

import { type ExecutionSettings, ExecutionMode } from "../../types/execution";
import { isoDurationToMinutes } from "../../utils/duration";

const STORAGE_KEY = "executionSettings";

export const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  mode: ExecutionMode.DOCKER,
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

/** The settings kept in browser storage, or null. */
export const readStoredExecutionSettings = (): ExecutionSettings | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as ExecutionSettings) : null;
  } catch (error) {
    console.error("Failed to load execution settings from localStorage:", error);
    return null;
  }
};

export const storeExecutionSettings = (settings: ExecutionSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save execution settings to localStorage:", error);
  }
};

/** Store the defaults when nothing is stored yet (the settings dialog reads them). */
export const ensureStoredExecutionSettings = (): void => {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }
  storeExecutionSettings(DEFAULT_EXECUTION_SETTINGS);
};

/** The flat settings the execute endpoint takes. */
export const flattenExecutionSettings = (settings: ExecutionSettings) => ({
  useDocker: settings.container?.enabled ?? false,
  containerImage: settings.container?.defaultImage ?? "ubuntu:22.04",
  outputDirectory: settings.output.directory ?? "results",
  outputNaming: settings.output?.namingPattern ?? "{workflow_name}_{timestamp}",
  maxCpus: settings.resources?.maxCpus ?? 4,
  maxMemory: settings.resources?.maxMemory ?? "4 GB",
  // Minutes; 0 lets the backend apply its default.
  executionTimeout: isoDurationToMinutes(settings.resources?.maxTime),
  errorStrategy: settings.errorHandling?.strategy ?? "terminate",
  cleanupOnFailure: settings.cleanup?.onFailure ?? true,
  nextflowVersion: settings.nextflow?.version ?? "25.04.4",
});

// A workflow's execution settings: the defaults, the copy kept in browser
// storage (shared with the bottom bar's settings dialog) and the flat shape
// the execute endpoint takes.

import { type ExecutionSettings, ExecutionMode } from "../../types/execution";
import { isoDurationToMinutes } from "../../utils/duration";

const STORAGE_KEY = "executionSettings";

/** `runProfile` for runs on this computer, whatever the default profile is. */
export const THIS_COMPUTER = "";

/**
 * Version 2: no time limit of the app's own by default (was 30 minutes).
 * Version 3: limits and the run profile come from the Settings page unless
 * the workflow chose its own.
 */
export const EXECUTION_SETTINGS_VERSION = 3;

export const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  version: EXECUTION_SETTINGS_VERSION,
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
    // No limit of its own: the server's default applies (24 h unless set).
    maxTime: "",
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

/**
 * Settings saved by an older version, brought up to date. Settings from
 * before versions still carry the old 30-minute default limit, which stopped
 * most nf-core pipeline runs early: it becomes the server's default. A limit
 * chosen later is saved with a version and kept. Before version 3, limits
 * other than the old defaults were chosen for the workflow: it keeps them.
 * A workflow without a run profile ran on this computer: it still does.
 */
export const migrateExecutionSettings = (
  settings: ExecutionSettings,
): ExecutionSettings => {
  const version = settings.version ?? 1;
  if (version >= EXECUTION_SETTINGS_VERSION) return settings;
  let resources = settings.resources;
  if (resources && version < 2 && resources.maxTime === "PT30M") {
    resources = { ...resources, maxTime: "" };
  }
  if (resources) {
    const ownLimits =
      resources.maxCpus !== 4 || resources.maxMemory !== "4.GB" || Boolean(resources.maxTime);
    resources = { ...resources, useDefaults: !ownLimits };
  }
  return {
    ...settings,
    resources,
    runProfile: settings.runProfile ?? THIS_COMPUTER,
    version: EXECUTION_SETTINGS_VERSION,
  };
};

/** The settings kept in browser storage, or null. */
export const readStoredExecutionSettings = (): ExecutionSettings | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved
      ? migrateExecutionSettings(JSON.parse(saved) as ExecutionSettings)
      : null;
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

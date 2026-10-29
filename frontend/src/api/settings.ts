import api from "../api";
import type { RunProfile } from "../execution/runProfiles";
import { getResponseStatus } from "../utils/errors";
import type { WorkflowCache } from "./runs";

/** When Resume is on by Run: after a failed or stopped run, whenever there is a cache, or never. */
export type ResumeMode = "after-failure" | "always" | "never";

/** What every workflow's runs use unless the workflow says otherwise (the Settings page). */
export interface RunDefaults {
  maxCpus: number;
  /** e.g. "4.GB". */
  maxMemory: string;
  /** 0: the server's own limit. */
  timeoutMinutes: number;
  resume: ResumeMode;
  runProfiles: RunProfile[];
  /** The profile runs use by default; none: this computer. */
  runProfile?: string;
}

export const BUILT_IN_RUN_DEFAULTS: RunDefaults = {
  maxCpus: 4,
  maxMemory: "4.GB",
  timeoutMinutes: 0,
  resume: "after-failure",
  runProfiles: [],
};

/** The run defaults; the built-in ones from an N-WAVE without settings. */
export const getRunDefaults = async (): Promise<RunDefaults> => {
  try {
    const response = await api.get<{ runDefaults: RunDefaults }>("/settings");
    return { ...BUILT_IN_RUN_DEFAULTS, ...response.data.runDefaults };
  } catch (caught: unknown) {
    if (getResponseStatus(caught) === 404) return BUILT_IN_RUN_DEFAULTS;
    throw caught;
  }
};

export const saveRunDefaults = async (runDefaults: RunDefaults): Promise<RunDefaults> => {
  const response = await api.put<{ runDefaults: RunDefaults }>("/settings", { runDefaults });
  return response.data.runDefaults;
};

/** Before a run: block it on problems, only warn, or don't check. */
export type WorkflowCheckMode = "block" | "warn" | "off";

/** Which of N-WAVE's features are on (Global Settings → Features). */
export interface Features {
  connectionHints: boolean;
  workflowCheck: WorkflowCheckMode;
  failureExplanations: boolean;
  glossary: boolean;
  templates: boolean;
  customCode: boolean;
  nodePacks: boolean;
  resume: boolean;
  runProfiles: boolean;
  notifications: boolean;
  performance: boolean;
}

export type FeatureId = keyof Features;

export const DEFAULT_FEATURES: Features = {
  connectionHints: true,
  workflowCheck: "block",
  failureExplanations: true,
  glossary: true,
  templates: true,
  customCode: true,
  nodePacks: true,
  resume: true,
  runProfiles: true,
  notifications: true,
  performance: true,
};

export interface FeatureSettings {
  features: Features;
  /** Fixed by the installation (NWAVE_FEATURES): shown, but not changeable. */
  locked: FeatureId[];
}

/** The feature switches; all on from an N-WAVE without them. */
export const getFeatures = async (): Promise<FeatureSettings> => {
  try {
    const response = await api.get<{ features?: Partial<Features>; lockedFeatures?: FeatureId[] }>(
      "/settings",
    );
    return {
      features: { ...DEFAULT_FEATURES, ...response.data.features },
      locked: response.data.lockedFeatures ?? [],
    };
  } catch (caught: unknown) {
    if (getResponseStatus(caught) === 404) return { features: DEFAULT_FEATURES, locked: [] };
    throw caught;
  }
};

export const saveFeatures = async (features: Features): Promise<FeatureSettings> => {
  const response = await api.put<{ features: Features; lockedFeatures: FeatureId[] }>(
    "/settings/features",
    { features },
  );
  return { features: response.data.features, locked: response.data.lockedFeatures };
};

/** The run cache of all workflows together. */
export const getAllCaches = async (): Promise<WorkflowCache> =>
  (await api.get<WorkflowCache>("/execute/caches")).data;

/** Delete every workflow's cache; `skipped` run folders are still in use. */
export const clearAllCaches = async (): Promise<WorkflowCache & { skipped: number }> =>
  (await api.delete<WorkflowCache & { skipped: number }>("/execute/caches")).data;

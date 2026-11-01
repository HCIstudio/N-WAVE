// Which features are on (Global Settings → Features), shared by every page of
// this tab: read once, read again when the tab comes back into view (they may
// have been changed in another tab), and saved from the Settings page. Until
// N-WAVE answers, every feature is on.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_FEATURES,
  type FeatureId,
  type Features,
  getFeatures,
  saveFeatures,
} from "../api/settings";
import { getApiErrorMessage } from "../utils/errors";

interface FeaturesState {
  features: Features;
  locked: FeatureId[];
  /** Verbose mode records parameter values and file contents (NWAVE_VERBOSE_VALUES). */
  recordsValues: boolean;
  loaded: boolean;
  error: string | null;
}

const INITIAL: FeaturesState = {
  features: DEFAULT_FEATURES,
  locked: [],
  recordsValues: false,
  loaded: false,
  error: null,
};

let state: FeaturesState = INITIAL;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (next: Partial<FeaturesState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const load = (): Promise<void> => {
  loading ??= getFeatures()
    .then(
      ({ features, locked, recordsValues }) =>
        setState({ features, locked, recordsValues: recordsValues ?? false, loaded: true, error: null }),
      (caught: unknown) =>
        setState({ error: getApiErrorMessage(caught, "The feature switches could not be read.") }),
    )
    .finally(() => {
      loading = null;
    });
  return loading;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let watching = false;
/** Load once, and again whenever the tab comes back into view (one listener for all). */
const ensureLoaded = () => {
  if (!state.loaded && !state.error) void load();
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void load();
  });
};

/** The features in effect right now, for code outside React (e.g. notifications). */
export const currentFeatures = (): Features => state.features;

/** Whether verbose mode records parameter values and file contents. */
export const currentRecordsValues = (): boolean => state.recordsValues;

/** Tests: forget what was read, or act as if the given switches were read. */
export const resetFeatures = (
  features?: Partial<Features>,
  locked: FeatureId[] = [],
  recordsValues = false,
): void => {
  state = features
    ? { ...INITIAL, features: { ...DEFAULT_FEATURES, ...features }, locked, recordsValues, loaded: true }
    : INITIAL;
  loading = null;
  for (const listener of listeners) listener();
};

/** The feature switches; components re-render when they change. */
export const useFeatures = () => {
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(ensureLoaded, []);

  /** Save new switches; throws with the reason when N-WAVE refuses them. */
  const save = useCallback(async (features: Features) => {
    const saved = await saveFeatures(features);
    setState({ features: saved.features, locked: saved.locked, loaded: true, error: null });
    return saved;
  }, []);

  return { ...current, save, reload: load };
};

/** Whether one on/off feature is on. */
export const useFeature = (id: Exclude<FeatureId, "workflowCheck">): boolean => {
  const features = useSyncExternalStore(subscribe, () => state.features);
  useEffect(ensureLoaded, []);
  return features[id];
};

/** How the workflow check works before a run. */
export const useWorkflowCheckMode = () => {
  const features = useSyncExternalStore(subscribe, () => state.features);
  useEffect(ensureLoaded, []);
  return features.workflowCheck;
};

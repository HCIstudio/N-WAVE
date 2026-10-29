// The run defaults, shared by every page of this tab: read once, read again
// when the tab comes back into view (they may have changed in another tab),
// and saved from the Settings page.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  BUILT_IN_RUN_DEFAULTS,
  getRunDefaults,
  type RunDefaults,
  saveRunDefaults,
} from "../api/settings";
import { getApiErrorMessage } from "../utils/errors";

interface RunDefaultsState {
  defaults: RunDefaults;
  /** False until N-WAVE answered once (the built-in defaults apply meanwhile). */
  loaded: boolean;
  error: string | null;
}

let state: RunDefaultsState = {
  defaults: BUILT_IN_RUN_DEFAULTS,
  loaded: false,
  error: null,
};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (next: Partial<RunDefaultsState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const load = (): Promise<void> => {
  loading ??= getRunDefaults()
    .then(
      (defaults) => setState({ defaults, loaded: true, error: null }),
      (caught: unknown) =>
        setState({ error: getApiErrorMessage(caught, "The run defaults could not be read.") }),
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

/** Forgets what was read (tests). */
export const resetRunDefaults = (): void => {
  state = { defaults: BUILT_IN_RUN_DEFAULTS, loaded: false, error: null };
  loading = null;
};

export const useRunDefaults = () => {
  const current = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (!state.loaded) void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /** Save new defaults; throws with the reason when N-WAVE refuses them. */
  const save = useCallback(async (defaults: RunDefaults) => {
    const saved = await saveRunDefaults(defaults);
    setState({ defaults: saved, loaded: true, error: null });
    return saved;
  }, []);

  return { ...current, save, reload: load };
};

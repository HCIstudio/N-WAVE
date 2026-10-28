// A workflow's execution settings with the run defaults of the Settings page
// filled in: what its runs and exports actually use.

import type { RunDefaults } from "../api/settings";
import type { RunProfile } from "../execution/runProfiles";
import type { ExecutionSettings } from "../types/execution";
import { minutesToIsoDuration } from "../utils/duration";

/**
 * The profiles a workflow can use: those of the Settings page, then any the
 * workflow still keeps itself (from before) that aren't named like one of them.
 */
export const availableRunProfiles = (
  settings: ExecutionSettings,
  defaults: RunDefaults,
): RunProfile[] => [
  ...defaults.runProfiles,
  ...(settings.runProfiles ?? []).filter(
    (own) => !defaults.runProfiles.some((profile) => profile.name === own.name),
  ),
];

/** Whether the workflow takes its limits from the Settings page. */
export const usesDefaultLimits = (settings: ExecutionSettings): boolean =>
  settings.resources?.useDefaults !== false;

export const applyRunDefaults = (
  settings: ExecutionSettings,
  defaults: RunDefaults,
): ExecutionSettings => ({
  ...settings,
  resources: usesDefaultLimits(settings)
    ? {
        ...settings.resources,
        maxCpus: defaults.maxCpus,
        maxMemory: defaults.maxMemory,
        maxTime: minutesToIsoDuration(defaults.timeoutMinutes),
      }
    : settings.resources,
  runProfiles: availableRunProfiles(settings, defaults),
  // Unset: the default profile; "": this computer.
  runProfile: settings.runProfile ?? defaults.runProfile ?? "",
});

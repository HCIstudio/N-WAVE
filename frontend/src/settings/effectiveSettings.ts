// A workflow's execution settings with the Global Settings filled in: what
// its runs and exports actually use. A workflow's own limits can be lower than
// the global ones, not higher.

import type { RunDefaults } from "../api/settings";
import type { RunProfile } from "../execution/runProfiles";
import type { ExecutionSettings } from "../types/execution";
import { isoDurationToMinutes, minutesToIsoDuration } from "../utils/duration";
import { smallerMemory } from "../utils/memory";

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

/** A workflow's own limits, lowered to the global ones where they are higher. */
export const capToGlobalLimits = (
  resources: ExecutionSettings["resources"],
  defaults: RunDefaults,
): ExecutionSettings["resources"] => {
  const ownMinutes = isoDurationToMinutes(resources.maxTime);
  const globalMinutes = defaults.timeoutMinutes;
  // 0 is "the limit above": the global one for a workflow, the server's globally.
  const minutes =
    globalMinutes > 0 && (ownMinutes === 0 || ownMinutes > globalMinutes) ? globalMinutes : ownMinutes;
  return {
    ...resources,
    maxCpus: Math.min(resources.maxCpus, defaults.maxCpus),
    maxMemory: smallerMemory(resources.maxMemory, defaults.maxMemory),
    maxTime: minutesToIsoDuration(minutes),
  };
};

export const applyRunDefaults = (
  settings: ExecutionSettings,
  defaults: RunDefaults,
  /** Run profiles switched on (Global Settings → Features); off, runs use this computer. */
  runProfilesOn = true,
): ExecutionSettings => ({
  ...settings,
  resources: usesDefaultLimits(settings)
    ? {
        ...settings.resources,
        maxCpus: defaults.maxCpus,
        maxMemory: defaults.maxMemory,
        maxTime: minutesToIsoDuration(defaults.timeoutMinutes),
      }
    : capToGlobalLimits(settings.resources, defaults),
  runProfiles: availableRunProfiles(settings, defaults),
  // Unset: the global profile; "": this computer.
  runProfile: runProfilesOn ? (settings.runProfile ?? defaults.runProfile ?? "") : "",
});

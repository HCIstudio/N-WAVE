import path from "node:path";
import { z } from "zod";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { runProfileFieldsSchema } from "../execution/runProfile";
import { readJsonFile, writeJsonFile } from "../utils/jsonFile";
import { memoryAmount } from "../validation/schemas";

// What every workflow's runs use unless the workflow says otherwise (the
// Settings page): resource limits, run profiles and the one used by default,
// and when Resume is on. Kept in the data folder, so all browsers share them.

export const RESUME_MODES = ["after-failure", "always", "never"] as const;

export const runDefaultsSchema = z
  .object({
    maxCpus: z.number().int().min(1).max(1_024).default(4),
    maxMemory: memoryAmount.default("4.GB"),
    /** Minutes; 0: the server's own limit (NWAVE_EXECUTION_TIMEOUT). */
    timeoutMinutes: z.number().int().min(0).max(35_791).default(0),
    /** When Resume is on by Run: after a failed or stopped run, whenever there is a cache, or never. */
    resume: z.enum(RESUME_MODES).default("after-failure"),
    runProfiles: z.array(runProfileFieldsSchema).max(50).default([]),
    /** The profile runs use by default; none: this computer. */
    runProfile: z.string().max(40).optional(),
  })
  .refine(
    (defaults) =>
      new Set(defaults.runProfiles.map((profile) => profile.name)).size ===
      defaults.runProfiles.length,
    { message: "Each run profile needs its own name", path: ["runProfiles"] }
  )
  .refine(
    (defaults) =>
      !defaults.runProfile ||
      defaults.runProfiles.some((profile) => profile.name === defaults.runProfile),
    { message: "The default run profile must be one of the run profiles", path: ["runProfile"] }
  );

export type RunDefaults = z.infer<typeof runDefaultsSchema>;

const settingsPath = (): string => path.join(getNwaveDataRoot(), "settings.json");

/** The saved defaults, or the built-in ones (a file that no longer fits is ignored). */
export const readRunDefaults = (): RunDefaults => {
  const parsed = runDefaultsSchema.safeParse(
    readJsonFile<{ runDefaults?: unknown }>(settingsPath(), {}).runDefaults ?? {}
  );
  return parsed.success ? parsed.data : runDefaultsSchema.parse({});
};

export const writeRunDefaults = (defaults: RunDefaults): void => {
  const current = readJsonFile<Record<string, unknown>>(settingsPath(), {});
  writeJsonFile(settingsPath(), { ...current, runDefaults: defaults });
};

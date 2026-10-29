import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { readJsonFile, writeJsonFile } from "../utils/jsonFile";

// Which of N-WAVE's features are on (Global Settings → Features). Off hides a
// feature in the app; saved workflows that use it still open and run. An
// installation can fix switches when it starts, so they can't be changed from
// the app (a course, a lab server, an evaluation):
//
//   NWAVE_FEATURES="connectionHints=off,workflowCheck=warn"
//   NWAVE_FEATURES_FILE=/path/to/features.json   ({"connectionHints": false, ...})
//
// Both may be set; NWAVE_FEATURES wins where they name the same switch.

export const WORKFLOW_CHECK_MODES = ["block", "warn", "off"] as const;

export const featuresSchema = z.object({
  /** Mark fitting inputs while dragging, and warn on connections that don't fit. */
  connectionHints: z.boolean().default(true),
  /** Before a run: block it on problems, only warn, or don't check. */
  workflowCheck: z.enum(WORKFLOW_CHECK_MODES).default("block"),
  /** Plain-language explanations next to a failed run's log. */
  failureExplanations: z.boolean().default(true),
  /** Term hover cards and the Help page. */
  glossary: z.boolean().default(true),
  /** New Workflow templates and the built-in examples. */
  templates: z.boolean().default(true),
  /** Custom processes, the Code tab and converting nodes to custom ones. */
  customCode: z.boolean().default(true),
  nodePacks: z.boolean().default(true),
  resume: z.boolean().default(true),
  /** Run profiles for clusters and the cloud. */
  runProfiles: z.boolean().default(true),
  notifications: z.boolean().default(true),
  /** A run's Performance tab, execution report and timeline. */
  performance: z.boolean().default(true),
});

export type Features = z.infer<typeof featuresSchema>;
export type FeatureId = keyof Features;

export const FEATURE_IDS = Object.keys(featuresSchema.shape) as FeatureId[];

const settingsPath = (): string => path.join(getNwaveDataRoot(), "settings.json");

const isFeatureId = (value: string): value is FeatureId =>
  (FEATURE_IDS as string[]).includes(value);

/** One switch's value from text: on/off (true/false, yes/no, 1/0), or a workflow check mode. */
const parseValue = (id: FeatureId, text: string): Features[FeatureId] | undefined => {
  const value = text.trim().toLowerCase();
  if (id === "workflowCheck") {
    return (WORKFLOW_CHECK_MODES as readonly string[]).includes(value)
      ? (value as Features["workflowCheck"])
      : undefined;
  }
  if (["on", "true", "yes", "1"].includes(value)) return true;
  if (["off", "false", "no", "0"].includes(value)) return false;
  return undefined;
};

/** "connectionHints=off,workflowCheck=warn"; entries that don't parse are reported and skipped. */
export const parseFeatureList = (list: string): Partial<Features> => {
  const fixed: Partial<Record<FeatureId, unknown>> = {};
  for (const entry of list.split(",")) {
    if (!entry.trim()) continue;
    const [name = "", value = ""] = entry.split("=");
    const id = name.trim();
    const parsed = isFeatureId(id) ? parseValue(id, value) : undefined;
    if (parsed === undefined) {
      console.warn(`NWAVE_FEATURES: ignoring "${entry.trim()}"`);
      continue;
    }
    fixed[id as FeatureId] = parsed;
  }
  return fixed as Partial<Features>;
};

/** A features JSON file's switches; unknown names or wrong values are reported and skipped. */
const parseFeatureFile = (file: string): Partial<Features> => {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error: unknown) {
    console.warn(`NWAVE_FEATURES_FILE: can't read ${file}:`, error);
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.warn(`NWAVE_FEATURES_FILE: ${file} isn't a JSON object`);
    return {};
  }
  const fixed: Partial<Record<FeatureId, unknown>> = {};
  for (const [id, value] of Object.entries(raw)) {
    const field = isFeatureId(id) ? featuresSchema.shape[id] : undefined;
    const parsed = field?.safeParse(value);
    if (!parsed?.success) {
      console.warn(`NWAVE_FEATURES_FILE: ignoring ${id}`);
      continue;
    }
    fixed[id as FeatureId] = parsed.data;
  }
  return fixed as Partial<Features>;
};

/** The switches the installation fixes, from NWAVE_FEATURES_FILE and NWAVE_FEATURES. */
export const lockedFeatures = (): Partial<Features> => ({
  ...(process.env.NWAVE_FEATURES_FILE ? parseFeatureFile(process.env.NWAVE_FEATURES_FILE) : {}),
  ...(process.env.NWAVE_FEATURES ? parseFeatureList(process.env.NWAVE_FEATURES) : {}),
});

const savedFeatures = (): Partial<Features> => {
  const saved = readJsonFile<{ features?: unknown }>(settingsPath(), {}).features;
  const parsed = featuresSchema.partial().safeParse(saved ?? {});
  return parsed.success ? parsed.data : {};
};

export interface FeatureSettings {
  /** What is in effect: the defaults, then what was saved, then what the installation fixes. */
  features: Features;
  /** The switches the installation fixes, which can't be changed from the app. */
  locked: FeatureId[];
}

export const readFeatures = (): FeatureSettings => {
  const locked = lockedFeatures();
  return {
    features: featuresSchema.parse({ ...savedFeatures(), ...locked }),
    locked: Object.keys(locked) as FeatureId[],
  };
};

export class LockedFeatureError extends Error {}

/** Save the switches; changing one the installation fixes is refused. */
export const writeFeatures = (features: Features): FeatureSettings => {
  const locked = lockedFeatures();
  const changed = (Object.keys(locked) as FeatureId[]).filter((id) => locked[id] !== features[id]);
  if (changed.length > 0) {
    throw new LockedFeatureError(
      `This installation fixes ${changed.join(", ")}; it can't be changed in the app.`
    );
  }
  const current = readJsonFile<Record<string, unknown>>(settingsPath(), {});
  writeJsonFile(settingsPath(), { ...current, features });
  return readFeatures();
};

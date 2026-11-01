import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { readJsonFile, writeJsonFile } from "../utils/jsonFile";

// Verbose mode's activity log: what happened in N-WAVE, one JSON line per
// event (activity.jsonl in the data folder). The browser decides what to
// record and sends it here in batches; this keeps it, reads it back filtered
// by time or marked test, and drops events older than the retention period.
// Nothing is kept while verbose mode is off.

/** One event; the browser fills in `data` for its type. */
export const activityEventSchema = z
  .object({
    id: z.string().min(1).max(64),
    /** ISO 8601. */
    time: z.string().datetime(),
    type: z.string().min(1).max(64),
    session: z.string().max(64).optional(),
    participant: z.string().max(64).optional(),
    test: z.string().max(64).optional(),
    workflowId: z.string().max(200).optional(),
    path: z.string().max(500).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict();

export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const activitySettingsSchema = z.object({
  /** Drop events older than this many days; none: keep everything. */
  retentionDays: z.number().int().min(1).max(3_650).nullable().default(null),
});

export type ActivitySettings = z.infer<typeof activitySettingsSchema>;

const logPath = (): string => path.join(getNwaveDataRoot(), "activity.jsonl");
const settingsPath = (): string => path.join(getNwaveDataRoot(), "settings.json");

/** Parameter values and file contents are recorded only when the installation says so. */
export const recordsValues = (): boolean =>
  ["on", "true", "yes", "1"].includes((process.env.NWAVE_VERBOSE_VALUES ?? "").trim().toLowerCase());

export const readActivitySettings = (): ActivitySettings => {
  const saved = readJsonFile<{ activityLog?: unknown }>(settingsPath(), {}).activityLog;
  const parsed = activitySettingsSchema.safeParse(saved ?? {});
  return parsed.success ? parsed.data : activitySettingsSchema.parse({});
};

export const writeActivitySettings = (settings: ActivitySettings): void => {
  const current = readJsonFile<Record<string, unknown>>(settingsPath(), {});
  writeJsonFile(settingsPath(), { ...current, activityLog: settings });
  prune();
};

/** Every recorded event, oldest first; lines that don't parse are skipped. */
const readAll = (): ActivityEvent[] => {
  let text: string;
  try {
    text = fs.readFileSync(logPath(), "utf8");
  } catch {
    return [];
  }
  const events: ActivityEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ActivityEvent);
    } catch {
      // A line cut short by a crash.
    }
  }
  return events;
};

const cutoff = (): number | null => {
  const { retentionDays } = readActivitySettings();
  return retentionDays === null ? null : Date.now() - retentionDays * 86_400_000;
};

/** Drop events older than the retention period. */
const prune = (): void => {
  const oldest = cutoff();
  if (oldest === null) return;
  const events = readAll();
  const kept = events.filter((event) => Date.parse(event.time) >= oldest);
  if (kept.length === events.length) return;
  writeLines(kept);
};

const writeLines = (events: ActivityEvent[]): void => {
  fs.mkdirSync(path.dirname(logPath()), { recursive: true });
  const temporary = `${logPath()}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, events.map((event) => `${JSON.stringify(event)}\n`).join(""));
  fs.renameSync(temporary, logPath());
};

/** Add events at the end of the log. */
export const appendActivity = (events: ActivityEvent[]): void => {
  if (events.length === 0) return;
  fs.mkdirSync(path.dirname(logPath()), { recursive: true });
  fs.appendFileSync(logPath(), events.map((event) => `${JSON.stringify(event)}\n`).join(""));
  prune();
};

export interface ActivityFilter {
  /** ISO times; `to` is exclusive. */
  from?: string;
  to?: string;
  /** Only the events of one marked test. */
  test?: string;
}

export const readActivity = (filter: ActivityFilter = {}): ActivityEvent[] => {
  prune();
  const from = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY;
  const to = filter.to ? Date.parse(filter.to) : Number.POSITIVE_INFINITY;
  return readAll().filter((event) => {
    const time = Date.parse(event.time);
    return time >= from && time < to && (!filter.test || event.test === filter.test);
  });
};

export interface MarkedTest {
  id: string;
  label?: string;
  startedAt: string;
  endedAt?: string;
}

export interface ActivitySummary {
  events: number;
  bytes: number;
  oldest?: string;
  newest?: string;
  /** The marked tests, newest first. */
  tests: MarkedTest[];
}

export const summarizeActivity = (): ActivitySummary => {
  const events = readActivity();
  const tests = new Map<string, MarkedTest>();
  for (const event of events) {
    if (!event.test) continue;
    const test = tests.get(event.test) ?? { id: event.test, startedAt: event.time };
    if (event.type === "test.started" && typeof event.data?.label === "string" && event.data.label) {
      test.label = event.data.label;
    }
    if (event.type === "test.ended") test.endedAt = event.time;
    tests.set(event.test, test);
  }
  let bytes = 0;
  try {
    bytes = fs.statSync(logPath()).size;
  } catch {
    // No log yet.
  }
  return {
    events: events.length,
    bytes,
    oldest: events[0]?.time,
    newest: events[events.length - 1]?.time,
    tests: [...tests.values()].reverse(),
  };
};

export const clearActivity = (): void => {
  fs.rmSync(logPath(), { force: true });
};

// Verbose mode's export: the activity log as a ZIP of JSON Lines, CSV and the
// workflow snapshots of each run, and the last minutes as text for a bug report.

import type { ActivityEvent } from "./activityEvents";

const CSV_COLUMNS = ["time", "type", "session", "participant", "test", "workflowId", "path", "data"] as const;

const csvCell = (value: unknown): string => {
  const text = value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One row per event; `data` as JSON (without snapshots). */
export const activityCsv = (events: ActivityEvent[]): string =>
  [
    CSV_COLUMNS.join(","),
    ...events.map((event) => CSV_COLUMNS.map((column) => csvCell(event[column])).join(",")),
  ].join("\n");

/** The events with each run's snapshot moved out to snapshots/<event id>.json. */
export const splitSnapshots = (
  events: ActivityEvent[],
): { events: ActivityEvent[]; snapshots: Record<string, unknown> } => {
  const snapshots: Record<string, unknown> = {};
  const lean = events.map((event) => {
    if (!event.data || !("snapshot" in event.data)) return event;
    const { snapshot, ...data } = event.data;
    const file = `snapshots/${event.id}.json`;
    snapshots[file] = snapshot;
    return { ...event, data: { ...data, snapshotFile: file } };
  });
  return { events: lean, snapshots };
};

export const activityJsonLines = (events: ActivityEvent[]): string =>
  events.map((event) => `${JSON.stringify(event)}\n`).join("");

const README = `N-WAVE activity log (verbose mode)

events.jsonl  one event per line (JSON), oldest first
events.csv    the same as a table; the data column holds each event's details as JSON
snapshots/    the workflow (nodes and connections) at each run; run.started events name their file

The format and what is and isn't recorded:
https://github.com/HCIstudio/N-WAVE/wiki/Settings#verbose-mode
`;

/** The ZIP's files: events.jsonl, events.csv, snapshots/ and a README. */
export const activityZipEntries = (events: ActivityEvent[]): Record<string, string> => {
  const { events: lean, snapshots } = splitSnapshots(events);
  return {
    "README.txt": README,
    "events.jsonl": activityJsonLines(lean),
    "events.csv": `${activityCsv(lean)}\n`,
    ...Object.fromEntries(
      Object.entries(snapshots).map(([file, snapshot]) => [file, `${JSON.stringify(snapshot, null, 2)}\n`]),
    ),
  };
};

export const buildActivityZip = async (events: ActivityEvent[]): Promise<Blob> => {
  const { strToU8, zipSync } = await import("fflate");
  const entries = Object.fromEntries(
    Object.entries(activityZipEntries(events)).map(([file, text]) => [file, strToU8(text)]),
  );
  return new Blob([zipSync(entries, { level: 6 })], { type: "application/zip" });
};

/** The minutes "Copy for bug report" copies. */
export const BUG_REPORT_MINUTES = 10;

/** Text to paste into an issue: the last minutes' events, without snapshots. */
export const bugReportText = (events: ActivityEvent[], now = Date.now()): string => {
  const since = now - BUG_REPORT_MINUTES * 60_000;
  const recent = splitSnapshots(events.filter((event) => Date.parse(event.time) >= since)).events;
  return [
    `N-WAVE activity, last ${BUG_REPORT_MINUTES} minutes (${recent.length} events):`,
    "```jsonl",
    activityJsonLines(recent).trimEnd(),
    "```",
  ].join("\n");
};

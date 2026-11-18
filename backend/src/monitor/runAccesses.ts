// A run's file accesses by task, from the I/O monitor's logs (linkAccesses.ts),
// worked out once after the run and kept next to the logs.

import fs from "node:fs";
import path from "node:path";
import { readRunTasks } from "../runs/taskEvents";
import { type LinkResult, linkAccesses, parseAccessLog, parseForkLog } from "./linkAccesses";
import { MONITOR_FILES, monitorDir, readMonitorPrefix, readMonitorSummary } from "./ioMonitor";
import type { WorkFolderCheck } from "./workFolders";

const LINKED_FILE = "linked.json";
/** Bumped when what linked.json holds changes, so older ones are worked out again. */
const LINKED_VERSION = 6;

export type RunAccesses =
  | { status: "off" | "running" | "unavailable" | "failed"; reason?: string }
  | ({ status: "recorded"; version: number; workFolders?: WorkFolderCheck[] } & LinkResult);

/** The run's accesses by task, worked out from the monitor's logs (and kept). */
export const readRunAccesses = (runDir: string, runId: string, nextflowLog?: string): RunAccesses => {
  const summary = readMonitorSummary(runDir, runId);
  if (!summary) return { status: "off" };
  if (summary.status !== "recorded") return { status: summary.status, reason: summary.reason };
  const outDir = path.join(runDir, monitorDir(runId));
  const cached = path.join(outDir, LINKED_FILE);
  try {
    const kept = JSON.parse(fs.readFileSync(cached, "utf8")) as RunAccesses;
    // The check of the work folders was made when the monitor stopped (monitor.json).
    if (kept.status === "recorded" && kept.version === LINKED_VERSION) return { ...kept, workFolders: summary.workFolders?.folders };
  } catch {
    // Not worked out yet.
  }
  const read = (name: string) => fs.readFileSync(path.join(outDir, name), "utf8");
  const prefix = readMonitorPrefix(read(MONITOR_FILES.log)) ?? undefined;
  const result = linkAccesses(
    parseAccessLog(read(MONITOR_FILES.accesses)),
    parseForkLog(read(MONITOR_FILES.processes)),
    readRunTasks(runDir, nextflowLog),
    prefix,
  );
  const accesses: RunAccesses = { status: "recorded", version: LINKED_VERSION, ...result };
  try {
    fs.writeFileSync(cached, JSON.stringify(accesses));
  } catch {
    // Read-only: worked out again next time.
  }
  return accesses.status === "recorded" ? { ...accesses, workFolders: summary.workFolders?.folders } : accesses;
};

import fs from "node:fs";
import path from "node:path";
import { getNwaveDataRoot } from "../execution/nfcoreModules";

// Runs started by this backend, by execution id, so their results can be
// listed and served later (e.g. a pipeline's MultiQC report). Only run
// directories recorded here are ever served.

const MAX_RUNS = 500;

interface RunRecord {
  dir: string;
  startedAt: string;
}

const indexPath = (): string => path.join(getNwaveDataRoot(), "runs.json");

const readIndex = (): Record<string, RunRecord> => {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), "utf8")) as Record<
      string,
      RunRecord
    >;
  } catch {
    return {};
  }
};

/** Remember a run's directory (keeps the newest MAX_RUNS). */
export const recordRun = (id: string, dir: string): void => {
  const entries = Object.entries(readIndex()).filter(([runId]) => runId !== id);
  entries.push([id, { dir, startedAt: new Date().toISOString() }]);
  fs.mkdirSync(path.dirname(indexPath()), { recursive: true });
  fs.writeFileSync(
    indexPath(),
    `${JSON.stringify(Object.fromEntries(entries.slice(-MAX_RUNS)), null, 2)}\n`
  );
};

/** The results directory of a recorded run, or null. */
export const findRunResultsDir = (id: string): string | null => {
  const run = readIndex()[id];
  if (!run) return null;
  const dir = path.join(run.dir, "results");
  return fs.existsSync(dir) ? dir : null;
};

/** Files under `root` (relative, "/"-separated), up to `limit`. */
export const listFiles = (
  root: string,
  limit = 5_000
): Array<{ path: string; size: number }> => {
  const files: Array<{ path: string; size: number }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          size: fs.statSync(full).size,
        });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
};

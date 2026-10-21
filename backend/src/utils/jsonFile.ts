import fs from "node:fs";
import path from "node:path";

// JSON files the backend keeps its state in (run history, installed nf-core
// components). Written to a temporary file and renamed into place, so a crash
// mid-write leaves the old file or the new one, never half of it. A file that
// can't be read anyway is set aside, not overwritten by the next write.

/** Write `value` as JSON, atomically. */
export const writeJsonFile = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

/**
 * The file's JSON, or `fallback` when it doesn't exist. An unreadable file
 * is renamed to `<file>.unreadable-<time>` so its content isn't lost.
 */
export const readJsonFile = <T>(file: string, fallback: T): T => {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      fs.renameSync(file, aside);
      console.warn(`${file} couldn't be read and was set aside as ${aside}:`, error);
    } catch {
      console.warn(`${file} couldn't be read:`, error);
    }
    return fallback;
  }
};

// Which files in the steps' work folders the I/O monitor saw. Every file a
// task's work folder holds was opened when it was made (by the task, or by
// Nextflow for the task), and the monitor records every open under the run's
// folder. A file made during the run that the monitor has no open of was
// missed: its accesses were lost, or recorded under another file's path.
// This counts the files whose opens were lost entirely, which the check of
// written bytes (checkRecordedWrites) can't see.

import fs from "node:fs";
import path from "node:path";

/** One task's work folder: its files, and those the monitor has no open of. */
export interface WorkFolderCheck {
  /** Relative to the work directory, e.g. "58/618e11d8bdd358338d6f9d4183ca2d". */
  folder: string;
  files: number;
  missed: number;
  /** The first few files missed, relative to the folder. */
  missedFiles: string[];
}

export interface WorkFoldersCheck {
  files: number;
  missed: number;
  folders: WorkFolderCheck[];
}

/** How many missed files a folder names. */
const NAMED = 5;

/** The paths the monitor recorded an open of, relative to the run's folder (`prefix`, as the kernel names it). */
export const openedPaths = (accessLog: string, prefix: string): Set<string> => {
  const opened = new Set<string>();
  for (const line of accessLog.split("\n")) {
    const fields = line.split(",");
    if (fields.length < 15 || (fields[8] ?? "").trim() !== "O") continue;
    // The path field is "<path>:<filter prefix>:"; a path can hold commas.
    const recorded = fields.slice(14).join(",").split(":")[0]?.trim() ?? "";
    if (recorded.startsWith(`${prefix}/`)) opened.add(recorded.slice(prefix.length + 1));
  }
  return opened;
};

/** The regular files under a folder (not following links), relative to it. */
const filesUnder = (folder: string, since: number): string[] => {
  const found: string[] = [];
  const walk = (relative: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(folder, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) {
        // Only files made or changed while the monitor ran: a resumed run's
        // cached tasks have folders from before it.
        try {
          if (fs.statSync(path.join(folder, child)).mtimeMs >= since) found.push(child);
        } catch {
          // Gone meanwhile.
        }
      }
      // Symbolic links are the inputs Nextflow staged: no file is made for them.
    }
  };
  walk("");
  return found.sort();
};

/**
 * Compares the files in each task's work folder (`<runDir>/nextflow/work/xx/…`)
 * with the opens the monitor recorded. `since` (ms): when the monitor started;
 * files older than that aren't counted.
 */
export const checkWorkFolders = (runDir: string, opened: Set<string>, since: number): WorkFoldersCheck => {
  const work = path.join(runDir, "nextflow", "work");
  const folders: WorkFolderCheck[] = [];
  let groups: fs.Dirent[] = [];
  try {
    groups = fs.readdirSync(work, { withFileTypes: true });
  } catch {
    return { files: 0, missed: 0, folders };
  }
  for (const group of groups.filter((entry) => entry.isDirectory() && /^[0-9a-f]{2}$/.test(entry.name))) {
    for (const task of fs.readdirSync(path.join(work, group.name), { withFileTypes: true })) {
      if (!task.isDirectory()) continue;
      const folder = `${group.name}/${task.name}`;
      const files = filesUnder(path.join(work, folder), since);
      if (files.length === 0) continue;
      const missed = files.filter((file) => !opened.has(`nextflow/work/${folder}/${file}`));
      folders.push({ folder, files: files.length, missed: missed.length, missedFiles: missed.slice(0, NAMED) });
    }
  }
  folders.sort((a, b) => a.folder.localeCompare(b.folder));
  return {
    files: folders.reduce((sum, folder) => sum + folder.files, 0),
    missed: folders.reduce((sum, folder) => sum + folder.missed, 0),
    folders,
  };
};

/** The checks of the work folders of the tasks with these hashes ("58/618e11"). */
export const foldersOfTasks = (folders: WorkFolderCheck[], hashes: string[]): WorkFolderCheck[] =>
  folders.filter((folder) => hashes.some((hash) => folder.folder.startsWith(hash)));

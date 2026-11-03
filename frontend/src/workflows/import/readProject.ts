// A Nextflow project to import, from a zip or a folder: its main script,
// the other .nf files its includes read, its nextflow.config, and the files
// in its inputs/ folder (where "Export project" puts uploaded files).

import { encodeFileContent, type FileContent } from "../../utils/fileContent";

export interface ImportProject {
  /** The main script's path among the files (`main.nf`). */
  path: string;
  source: string;
  /** Every .nf file, by path from the project folder. */
  files: Record<string, string>;
  /** nextflow.config, when the project has one. */
  config: string;
  /** The files in inputs/, by name. */
  inputs: Record<string, FileContent>;
}

const TEXT_FILE = /\.(nf|config)$/;
/** What a project import reads: scripts, config and input files. */
const WANTED = (path: string) => TEXT_FILE.test(path) || /(^|\/)inputs\/[^/]+$/.test(path);

const asText = (content: string | Uint8Array): string => (typeof content === "string" ? content : new TextDecoder().decode(content));

/** The folder every path is in (a zip of `Project/…`), or "". */
const sharedFolder = (paths: string[]): string => {
  const first = paths[0]?.split("/") ?? [];
  let shared = 0;
  while (shared < first.length - 1 && paths.every((path) => path.split("/")[shared] === first[shared])) shared += 1;
  return first.slice(0, shared).join("/");
};

/**
 * The project in a set of files (paths as in the zip or folder). Its main
 * script is main.nf at the top, else the top-most .nf with an entry
 * workflow (`workflow { … }`).
 */
export const readProject = (entries: Record<string, string | Uint8Array>): ImportProject => {
  const paths = Object.keys(entries).filter((path) => !path.split("/").some((part) => part.startsWith(".") || part === "work"));
  const folder = sharedFolder(paths);
  const files: Record<string, string> = {};
  const inputs: Record<string, FileContent> = {};
  for (const path of paths) {
    const relative = folder ? path.slice(folder.length + 1) : path;
    const content = entries[path];
    if (TEXT_FILE.test(relative)) files[relative] = asText(content);
    else if (/^inputs\/[^/]+$/.test(relative)) {
      inputs[relative.slice("inputs/".length)] = typeof content === "string" ? { content } : encodeFileContent(content);
    }
  }
  const scripts = Object.keys(files).filter((path) => path.endsWith(".nf"));
  const depth = (path: string) => path.split("/").length;
  const main =
    scripts.find((path) => path === "main.nf") ??
    scripts.filter((path) => /(^|\n)\s*workflow\s*\{/.test(files[path])).sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
  if (!main) throw new Error("No Nextflow script with a workflow (`workflow { … }`) was found in the project.");
  return { path: main, source: files[main], files, config: files["nextflow.config"] ?? "", inputs };
};

/** The files of a zip a project import reads, by path. */
export const readZip = async (bytes: Uint8Array): Promise<Record<string, Uint8Array>> => {
  const { unzipSync } = await import("fflate");
  return unzipSync(bytes, { filter: (file) => WANTED(file.name) });
};

/** The files of a chosen folder (`<input webkitdirectory>`) a project import reads, by path. */
export const readFolder = async (files: Iterable<File>): Promise<Record<string, Uint8Array>> => {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (WANTED(path)) entries[path] = new Uint8Array(await file.arrayBuffer());
  }
  return entries;
};

// Reading an imported project: its input files, and the processes,
// workflows and functions its includes bring in from its other files.

import type { NodeData } from "../../components/nodes/BaseNode";
import { fileByteLength, type FileContent } from "../../utils/fileContent";
import { maskSource, type TopLevelItem, topLevelItems } from "./nextflowSource";
import { directoryOf, normalizePath, relativePath } from "./projectPaths";

/** The names code calls: `FOO(…)`, `helper(…)`. */
export const namesCalledIn = (text: string): Set<string> =>
  new Set([...maskSource(text, { keepInterpolations: true }).matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)].map((match) => match[1]));

/** `/* Note: label` comments N-WAVE writes for Note nodes: their label and text. */
export const readNotes = (source: string): Array<{ label: string; text: string }> => {
  const masked = maskSource(source);
  const notes: Array<{ label: string; text: string }> = [];
  for (const note of source.matchAll(/\/\*\s*Note:[ \t]*([^\n]*)\n([\s\S]*?)\n?\*\//g)) {
    // Only comments (not text in strings).
    if (masked.slice(note.index ?? 0, (note.index ?? 0) + 2) !== "/*") continue;
    notes.push({ label: (note[1] ?? "").trim(), text: (note[2] ?? "").replace(/\* \//g, "*/") });
  }
  return notes;
};

/**
 * The project around the script at `path`: `files` by path, `inputs` (its
 * inputs/ folder) by name.
 */
export const createProjectReader = ({
  files = {},
  inputs = {},
  path,
}: {
  files?: Record<string, string>;
  inputs?: Record<string, FileContent>;
  path?: string;
}) => {
  /** A File Input's files: from the project when it has them, else names to upload again. */
  const inputFilesFor = (names: string[]): Partial<NodeData> => {
    const found = names.every((name) => inputs[name]);
    const list = names.map((name) => {
      const input = inputs[name];
      const fileType = name.split(".").pop() || "txt";
      if (!input) return { name, size: 0, content: "", fileType };
      return { name, size: fileByteLength(input), content: input.content, ...(input.encoding ? { encoding: input.encoding } : {}), fileType };
    });
    const size = list.reduce((total, file) => total + file.size, 0);
    return {
      files: list,
      subtitle:
        names.length === 0
          ? "No files yet"
          : found
            ? `Total size: ${(size / 1024).toFixed(2)} KB`
            : `${names.length} file${names.length === 1 ? "" : "s"} (upload again)`,
    };
  };
  const scriptPath = normalizePath(path ?? "main.nf");
  /** An include's path from the project root (`./modules/nf-core/fastqc/main`). */
  const rootPath = (from: string, path: string): string =>
    path.startsWith(".") ? relativePath(directoryOf(scriptPath), normalizePath(`${directoryOf(from)}/${path}`)) : path;
  /** The file an include reads, among the project's files. */
  const fileFor = (from: string, path: string): string | null => {
    if (!path.startsWith(".")) return null;
    const base = normalizePath(`${directoryOf(from)}/${path}`);
    return [base, `${base}.nf`, `${base}/main.nf`].find((candidate) => candidate in files) ?? null;
  };
  /** A process or workflow a local include brings in, from the project's files. */
  const readLocalInclude = (
    from: string,
    path: string,
    name: string,
  ):
    | { kind: "process"; text: string }
    | { kind: "workflow"; item: TopLevelItem; file: string }
    | { kind: "function"; text: string }
    | null => {
    const file = fileFor(from, path);
    if (!file) return null;
    const item = topLevelItems(files[file]).find(
      (candidate) => candidate.name === name && ["process", "workflow", "function"].includes(candidate.kind),
    );
    if (!item) return null;
    if (item.kind === "function") return { kind: "function", text: functionsCalled(file, [name]).join("\n\n") };
    return item.kind === "process" ? { kind: "process", text: item.text } : { kind: "workflow", item, file };
  };
  /** The functions of a file that code calling `names` needs (those they call too), as written. */
  const functionsCalled = (file: string, names: Iterable<string>): string[] => {
    const functions = topLevelItems(files[file] ?? "").filter((other) => other.kind === "function");
    const needed = new Set<string>();
    let reached = [...names];
    while (reached.length > 0) {
      const next: string[] = [];
      for (const name of reached) {
        const fn = functions.find((other) => other.name === name);
        if (!fn || needed.has(name)) continue;
        needed.add(name);
        next.push(...namesCalledIn(fn.text));
      }
      reached = next;
    }
    return functions.filter((fn) => needed.has(fn.name)).map((fn) => [...fn.comments, fn.text].join("\n"));
  };
  return { files, inputs, scriptPath, inputFilesFor, rootPath, readLocalInclude, functionsCalled };
};

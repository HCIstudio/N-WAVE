// What the Filter, Map and Merge operators make of their incoming files, in
// the browser, so the node and the Output Display show it before a run.

import { useEffect, useMemo } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { isBinaryFile } from "../../utils/fileContent";

export type OperatorType = "filter" | "map" | "merge";

/** A file without content passes as an empty one; a binary file as it is. */
const eachTextFile = (files: FileObject[], change: (lines: string[]) => string[]): FileObject[] =>
  files.map((file) => {
    if (!file.content || typeof file.content !== "string") return { ...file, content: "", size: 0 };
    if (isBinaryFile(file)) return file;
    const content = change(file.content.split("\n")).join("\n");
    return { ...file, content, size: content.length };
  });

const lineMatches = (line: string, text: string, mode: NodeData["filterMode"]): boolean => {
  switch (mode) {
    case "startsWith":
      return line.startsWith(text);
    case "endsWith":
      return line.endsWith(text);
    case "matches":
      return new RegExp(text).test(line);
    default:
      return line.includes(text);
  }
};

/** The selected files (all without a selection), with the lines that match (or don't, negated). */
export const previewFilter = (files: FileObject[], data: NodeData): FileObject[] => {
  const selected = new Set((data.selectedFilterFiles ?? []).map((file) => file.name));
  const chosen = selected.size > 0 ? files.filter((file) => selected.has(file.name)) : files;
  const { filterText = "", filterMode = "contains", filterNegate = false } = data;
  if (!filterText) return chosen;
  return eachTextFile(chosen, (lines) =>
    lines.filter((line) => {
      try {
        return lineMatches(line, filterText, filterMode) !== filterNegate;
      } catch {
        // An invalid regular expression matches nothing, negated or not.
        return false;
      }
    }),
  );
};

/** Each line in another case, or with text replaced (a regular expression). */
export const previewMap = (files: FileObject[], data: NodeData): FileObject[] => {
  const { mapOperation = "changeCase", mapChangeCase = "toUpperCase", mapReplaceFind = "", mapReplaceWith = "" } =
    data;
  return eachTextFile(files, (lines) =>
    lines.map((line) => {
      if (!line) return line;
      if (mapOperation === "changeCase") return mapChangeCase === "toLowerCase" ? line.toLowerCase() : line.toUpperCase();
      if (mapOperation !== "replaceText" || !mapReplaceFind) return line;
      try {
        return line.replace(new RegExp(mapReplaceFind, "g"), mapReplaceWith);
      } catch {
        return line;
      }
    }),
  );
};

/** One file: the text files' lines collected, counted or joined. */
export const previewMerge = (files: FileObject[], data: NodeData): FileObject[] => {
  if (files.length === 0) return [];
  const { mergeOperation = "collect", mergeJoinSeparator = "\\n" } = data;
  const text = files
    .filter((file) => file.content && typeof file.content === "string" && !isBinaryFile(file))
    .map((file) => file.content)
    .join("\n");
  const lines = text.split("\n").filter(Boolean);
  const content = !text
    ? ""
      : mergeOperation === "collect"
        ? lines.join("\n")
        : mergeOperation === "count"
          ? `File count: ${files.length}\nLine count: ${lines.length}`
          : mergeOperation === "join"
            ? lines.join(mergeJoinSeparator.replace(/\\n/g, "\n"))
            : "Error: Unknown merge operation";
  return [{ name: "merge_result.txt", content, size: content.length }];
};

export const OPERATOR_PREVIEWS: Record<OperatorType, (files: FileObject[], data: NodeData) => FileObject[]> = {
  filter: previewFilter,
  map: previewMap,
  merge: previewMerge,
};

export const isOperatorType = (type: string | null | undefined): type is OperatorType =>
  type === "filter" || type === "map" || type === "merge";

/**
 * The node's subtitle: how many files came out, and "(unedited)" when they
 * are what came in. A filter compares with the files it was given to filter.
 */
export const previewSubtitle = (
  type: OperatorType,
  result: FileObject[],
  incoming: FileObject[],
  selected: FileObject[] = [],
): string => {
  if (type === "merge") return result.length > 0 ? "Merged to 1 file" : "Merged (0 files)";
  const filteredBySelection = type === "filter" && selected.length > 0 && selected.length < incoming.length;
  const baseline = type === "filter" && selected.length > 0 ? selected : incoming;
  const edited =
    filteredBySelection ||
    result.some((file) => {
      const before = baseline.find((entry) => entry.name === file.name);
      return !before || (before.content || "") !== (file.content || "");
    });
  const count = result.length;
  return `${type === "filter" ? "Filtered" : "Mapped"} ${count} file${count === 1 ? "" : "s"}${edited ? "" : " (unedited)"}`;
};

/** The settings each operator's preview reads; the preview is made again when they change. */
const SETTINGS: Array<keyof NodeData> = [
  "filterText",
  "filterMode",
  "filterNegate",
  "selectedFilterFiles",
  "mapOperation",
  "mapChangeCase",
  "mapReplaceFind",
  "mapReplaceWith",
  "mergeOperation",
  "mergeJoinSeparator",
];

/**
 * Keep the node's `files` (what the Output Display shows) and `subtitle` up
 * to date with its preview. Without incoming files, or while some must be
 * uploaded again, OperatorNode writes the subtitle, so only `files` is saved.
 */
export const useOperatorPreview = (
  incoming: FileObject[],
  data: NodeData,
  type: string | null,
  onSave: (data: Partial<NodeData>) => void,
): void => {
  const settings = JSON.stringify(SETTINGS.map((key) => data[key] ?? null));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settings` stands for the fields of `data` the preview reads; the rest of `data` (its own files and subtitle) mustn't make it again.
  const result = useMemo(
    () => (isOperatorType(type) ? OPERATOR_PREVIEWS[type](incoming, data) : null),
    [type, incoming, settings],
  );
  const selected = data.selectedFilterFiles;

  // A selection of files that no longer come in is cleared.
  useEffect(() => {
    if (type !== "filter" || !selected?.length) return;
    const names = new Set(incoming.map((file) => file.name));
    if (selected.some((file) => !names.has(file.name))) onSave({ selectedFilterFiles: [] });
  }, [type, incoming, selected, onSave]);

  useEffect(() => {
    if (!result || !isOperatorType(type)) return;
    if (incoming.length === 0 || incoming.some((file) => !file.content || file.content.trim() === "")) {
      onSave({ files: result });
      return;
    }
    onSave({ files: result, subtitle: previewSubtitle(type, result, incoming, selected) });
  }, [result, type, incoming, selected, onSave]);
};

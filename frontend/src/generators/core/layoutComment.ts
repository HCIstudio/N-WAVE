// The one line N-WAVE adds at the end of the scripts it writes, so importing
// a script gives the same canvas back:
//
//   // N-WAVE layout: FILTER_BARRY 320,120 "Filter Barry"; MERGE 560,180 "Merge"
//
// One entry per node: its name in the workflow (process names; input nodes
// and channel operators by the name processNamesFor gives them), where it
// sits and its label. Everything else (the steps, their settings and
// connections) is read from the code; a script without this line is laid out
// automatically.

import type { Node } from "@xyflow/react";

export const LAYOUT_PREFIX = "// N-WAVE layout:";

export interface LayoutEntry {
  name: string;
  x: number;
  y: number;
  label?: string;
}

const quote = (text: string): string =>
  `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;

export const formatLayoutComment = (nodes: Node[], names: Map<string, string>): string => {
  const entries = nodes.flatMap((node) => {
    const name = names.get(node.id);
    if (!name) return [];
    const x = Math.round(node.position?.x ?? 0);
    const y = Math.round(node.position?.y ?? 0);
    const label = (node.data as { label?: unknown }).label;
    return [`${name} ${x},${y}${typeof label === "string" && label ? ` ${quote(label)}` : ""}`];
  });
  return `${LAYOUT_PREFIX} ${entries.join("; ")}`;
};

/** The entries of a script's layout line, by name; empty when it has none. */
export const parseLayoutComment = (script: string): Map<string, LayoutEntry> => {
  const entries = new Map<string, LayoutEntry>();
  const line = script
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.trim().startsWith(LAYOUT_PREFIX));
  if (!line) return entries;
  const text = line.trim().slice(LAYOUT_PREFIX.length);
  const entry = /\s*([A-Za-z_][A-Za-z0-9_]*)\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\s+"((?:[^"\\]|\\.)*)")?\s*(?:;|$)/gy;
  for (let match = entry.exec(text); match; match = entry.exec(text)) {
    entries.set(match[1], {
      name: match[1],
      x: Number(match[2]),
      y: Number(match[3]),
      ...(match[4] !== undefined ? { label: match[4].replace(/\\(.)/g, "$1") } : {}),
    });
  }
  return entries;
};

/** The script without its layout line. */
export const withoutLayoutComment = (script: string): string =>
  script
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(LAYOUT_PREFIX))
    .join("\n")
    .replace(/\n+$/, "\n");

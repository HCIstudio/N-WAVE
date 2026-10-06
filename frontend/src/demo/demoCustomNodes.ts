// Custom node storage for the backend-less demo, kept in localStorage. Mirrors
// the backend's /api/custom-nodes responses.

import type { StoredCustomNode } from "../registry/customNodes";
import { DemoStoreError } from "./demoStore";

const STORAGE_KEY = "nwave.demo.customNodes";

const read = (): StoredCustomNode[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as StoredCustomNode[]) : [];
  } catch {
    return [];
  }
};

const write = (nodes: StoredCustomNode[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
};

export const demoCustomNodes = {
  list(): { schemaVersion: number; nodes: StoredCustomNode[] } {
    const nodes = read().sort((a, b) =>
      (a.label || a.id).localeCompare(b.label || b.id),
    );
    return { schemaVersion: 1, nodes };
  },

  /** Insert or replace a node by id. */
  save(node: StoredCustomNode): { node: StoredCustomNode } {
    if (!node || typeof node.id !== "string" || node.id.trim() === "") {
      throw new DemoStoreError(400, "Custom node id is required");
    }
    write([...read().filter((existing) => existing.id !== node.id), node]);
    return { node };
  },

  /** Remove a node; returns false when it didn't exist. */
  remove(id: string): boolean {
    const nodes = read();
    const remaining = nodes.filter((node) => node.id !== id);
    write(remaining);
    return remaining.length !== nodes.length;
  },
};

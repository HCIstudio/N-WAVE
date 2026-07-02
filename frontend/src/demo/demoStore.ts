// Browser-backed workflow store for the demo build.
//
// In the hosted GitHub Pages demo there is no backend/MongoDB, so workflows the
// visitor creates live in localStorage ("ephemeral projects" — they stay in
// that browser and vanish if storage is cleared). This module reproduces the
// slice of backend/src/controllers/workflowController.ts that the frontend
// actually uses, returning the exact same WorkflowDescriptor shape.

import type { WorkflowDescriptor } from "../types/backend";
import { defaultExecutionSettings } from "../workflows/defaultExecutionSettings";
import { DEMO_WORKFLOW_ID, demoWorkflowSeed } from "./demoWorkflow";

const STORAGE_KEY = "nwave.demo.workflows";

/** Internal persisted record. Materialized into a WorkflowDescriptor on read. */
interface StoredWorkflow {
  _id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  executionSettings: any;
  rawSource: string | null;
  importWarnings: string[];
  originType: "database" | "imported";
  sourceFormat: "visual" | "nextflow";
  sourceKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const generateId = (): string => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return `demo-${cryptoObj.randomUUID()}`;
  }
  return `demo-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const readStore = (): StoredWorkflow[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredWorkflow[]) : [];
  } catch {
    return [];
  }
};

const writeStore = (workflows: StoredWorkflow[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
};

/** Mirrors backend materializeWorkflow(): a stored record -> API descriptor. */
const materialize = (stored: StoredWorkflow): WorkflowDescriptor => ({
  _id: stored._id,
  name: stored.name,
  description: stored.description,
  nodes: stored.nodes,
  edges: stored.edges,
  executionSettings: stored.executionSettings,
  rawSource: stored.rawSource,
  importWarnings: stored.importWarnings,
  isBuiltin: false,
  isReadOnly: false,
  origin: {
    type: stored.originType,
    sourceFormat: stored.sourceFormat,
    sourceKey: stored.sourceKey,
    readOnly: false,
    canDuplicate: true,
  },
});

/** The read-only built-in demo, materialized. Never persisted. */
const getBuiltinDemoDescriptor = (): WorkflowDescriptor => ({
  _id: demoWorkflowSeed.id,
  name: demoWorkflowSeed.name,
  description: demoWorkflowSeed.description,
  nodes: demoWorkflowSeed.nodes,
  edges: demoWorkflowSeed.edges,
  executionSettings: defaultExecutionSettings,
  rawSource: null,
  importWarnings: [],
  isBuiltin: true,
  isReadOnly: true,
  origin: {
    type: "builtin",
    sourceFormat: "visual",
    sourceKey: "demo/basic",
    readOnly: true,
    canDuplicate: true,
  },
});

const isBuiltinId = (id: string): boolean => id === DEMO_WORKFLOW_ID;

export const demoStore = {
  /** GET /workflows — built-in first, then the visitor's saved workflows. */
  list(): WorkflowDescriptor[] {
    return [getBuiltinDemoDescriptor(), ...readStore().map(materialize)];
  },

  /** GET /workflows/:id */
  get(id: string): WorkflowDescriptor | null {
    if (isBuiltinId(id)) return getBuiltinDemoDescriptor();
    const stored = readStore().find((workflow) => workflow._id === id);
    return stored ? materialize(stored) : null;
  },

  /** POST /workflows */
  create(payload: Partial<StoredWorkflow>): WorkflowDescriptor {
    const now = new Date().toISOString();
    const stored: StoredWorkflow = {
      _id: generateId(),
      name: payload.name ?? "Untitled Workflow",
      description: payload.description ?? "",
      nodes: payload.nodes ?? [],
      edges: payload.edges ?? [],
      executionSettings: payload.executionSettings ?? defaultExecutionSettings,
      rawSource: payload.rawSource ?? null,
      importWarnings: payload.importWarnings ?? [],
      originType: payload.originType ?? "database",
      sourceFormat: payload.sourceFormat ?? "visual",
      sourceKey: payload.sourceKey ?? null,
      createdAt: now,
      updatedAt: now,
    };
    writeStore([...readStore(), stored]);
    return materialize(stored);
  },

  /** PUT /workflows/:id */
  update(id: string, payload: Partial<StoredWorkflow>): WorkflowDescriptor {
    if (isBuiltinId(id)) {
      throw new DemoStoreError(
        403,
        "Built-in workflows are read-only. Duplicate the workflow to create an editable copy."
      );
    }
    const workflows = readStore();
    const index = workflows.findIndex((workflow) => workflow._id === id);
    if (index === -1) {
      throw new DemoStoreError(404, "Workflow not found for update");
    }
    const existing = workflows[index];
    const updated: StoredWorkflow = {
      ...existing,
      name: payload.name ?? existing.name,
      description: payload.description ?? existing.description,
      nodes: payload.nodes ?? existing.nodes,
      edges: payload.edges ?? existing.edges,
      executionSettings: payload.executionSettings ?? existing.executionSettings,
      updatedAt: new Date().toISOString(),
    };
    workflows[index] = updated;
    writeStore(workflows);
    return materialize(updated);
  },

  /** DELETE /workflows/:id */
  remove(id: string): void {
    if (isBuiltinId(id)) {
      throw new DemoStoreError(
        403,
        "Built-in workflows cannot be deleted. Duplicate the workflow to create an editable copy."
      );
    }
    writeStore(readStore().filter((workflow) => workflow._id !== id));
  },

  /** POST /workflows/:id/duplicate */
  duplicate(id: string): WorkflowDescriptor {
    const source = this.get(id);
    if (!source) {
      throw new DemoStoreError(404, "Workflow not found");
    }
    return this.create({
      name: `${source.name} Copy`,
      description: source.description,
      nodes: source.nodes,
      edges: source.edges,
      executionSettings: source.executionSettings,
      rawSource: source.rawSource ?? null,
      importWarnings: source.importWarnings ?? [],
      originType: "imported",
      sourceFormat: source.origin?.sourceFormat ?? "visual",
      sourceKey: source.origin?.sourceKey ?? id,
    });
  },
};

/** Carries an HTTP-like status so the demo API client can mimic axios errors. */
export class DemoStoreError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DemoStoreError";
    this.status = status;
  }
}

import type { Edge, Node } from "reactflow";
import { describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  DEFAULT_EXECUTION_SETTINGS,
  ensureStoredExecutionSettings,
  flattenExecutionSettings,
  readStoredExecutionSettings,
} from "./executionSettings";
import { hydrateEdges, loadErrorFor, sanitizeNodesForSave } from "./workflowDocument";

const node = (id: string, type: string, data: Partial<NodeData> = {}) =>
  ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } }) as Node<NodeData>;

describe("hydrateEdges", () => {
  it("upgrades File Input and Merge handles of older workflows", () => {
    const nodes = [
      node("in", "fileInput"),
      node("merge", "operator", { operatorType: "merge" }),
    ];
    const onDelete = vi.fn();
    const [edge] = hydrateEdges(
      [
        {
          id: "e",
          source: "in",
          sourceHandle: "out",
          target: "merge",
          targetHandle: "in2",
        } as Edge,
      ],
      nodes,
      onDelete,
    );
    expect(edge).toMatchObject({
      sourceHandle: "ch_files_out",
      targetHandle: "in",
      type: "default",
      data: { order: 1, onDelete },
    });
  });

  it("keeps current handles and a stored order", () => {
    const [edge] = hydrateEdges(
      [
        {
          id: "e",
          source: "a",
          sourceHandle: "out",
          target: "b",
          targetHandle: "reads",
          data: { order: 3 },
        } as Edge,
      ],
      [node("a", "process"), node("b", "process")],
      () => undefined,
    );
    expect(edge).toMatchObject({
      sourceHandle: "out",
      targetHandle: "reads",
      data: { order: 3 },
    });
  });
});

describe("sanitizeNodesForSave", () => {
  it("drops file contents but keeps what was selected", () => {
    const file = { name: "a.txt", size: 3, fileType: "txt", content: "abc" };
    const [saved] = sanitizeNodesForSave([
      node("in", "fileInput", {
        files: [file],
        selectedFilterFiles: [file],
        fileContent: "abc",
        processedContent: "ABC",
      }),
    ]);
    expect(saved.data.files).toEqual([{ ...file, content: "" }]);
    expect(saved.data.selectedFilterFiles).toEqual([{ ...file, content: "" }]);
    expect(saved.data.fileContent).toBeUndefined();
    expect(saved.data.processedContent).toBeUndefined();
    expect(saved.data.label).toBe("in");
  });
});

describe("loadErrorFor", () => {
  it("tells a missing workflow from a backend that doesn't answer", () => {
    expect(loadErrorFor({ response: { status: 404 } }).title).toBe(
      "Workflow not found",
    );
    expect(loadErrorFor(new Error("Network Error"))).toMatchObject({
      title: "Couldn't load this workflow",
      detail: expect.stringContaining("Network Error"),
    });
  });
});

describe("execution settings", () => {
  it("flattens settings for the execute endpoint", () => {
    expect(flattenExecutionSettings(DEFAULT_EXECUTION_SETTINGS)).toEqual({
      useDocker: true,
      containerImage: "ubuntu:22.04",
      outputDirectory: "results",
      outputNaming: "{workflow_name}_{timestamp}",
      maxCpus: 4,
      maxMemory: "4.GB",
      executionTimeout: 30,
      errorStrategy: "terminate",
      cleanupOnFailure: false,
      nextflowVersion: "25.04.4",
    });
  });

  it("stores the defaults once, without replacing stored settings", () => {
    localStorage.clear();
    ensureStoredExecutionSettings();
    expect(readStoredExecutionSettings()).toEqual(DEFAULT_EXECUTION_SETTINGS);

    const changed = {
      ...DEFAULT_EXECUTION_SETTINGS,
      resources: { ...DEFAULT_EXECUTION_SETTINGS.resources, maxCpus: 2 },
    };
    localStorage.setItem("executionSettings", JSON.stringify(changed));
    ensureStoredExecutionSettings();
    expect(readStoredExecutionSettings()?.resources.maxCpus).toBe(2);
  });
});

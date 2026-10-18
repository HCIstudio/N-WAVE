import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  DEFAULT_EXECUTION_SETTINGS,
  ensureStoredExecutionSettings,
  flattenExecutionSettings,
  migrateExecutionSettings,
  readStoredExecutionSettings,
} from "./executionSettings";
import {
  hydrateEdges,
  hydrateNodes,
  loadErrorFor,
  SAVED_FILE_CONTENT_LIMIT,
  sanitizeNodesForSave,
} from "./workflowDocument";

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

describe("hydrateNodes", () => {
  it("drops the sizes React Flow 11 saved, so nodes are measured again", () => {
    const saved = {
      ...node("a", "process"),
      width: 123,
      height: 110,
      positionAbsolute: { x: 0, y: 0 },
      measured: { width: 240, height: 214 },
    } as Node<NodeData>;
    const [hydrated] = hydrateNodes([saved]);
    expect(hydrated).not.toHaveProperty("width");
    expect(hydrated).not.toHaveProperty("height");
    expect(hydrated).not.toHaveProperty("positionAbsolute");
    expect(hydrated.measured).toEqual({ width: 240, height: 214 });
  });

  it("names File Input's old output like its edges do", () => {
    const [hydrated] = hydrateNodes([
      node("in", "fileInput", {
        outputs: [{ name: "out", isConnectable: true }],
      }),
    ]);
    expect(hydrated.data.outputs).toEqual([
      { name: "ch_files_out", isConnectable: true },
    ]);
  });
});

describe("hydrateEdges with React Flow 12", () => {
  const edge = (sourceHandle: string, targetHandle: string) =>
    ({ id: "e", source: "a", sourceHandle, target: "b", targetHandle }) as Edge;

  it("attaches an edge to a node's only port, whatever handle it names", () => {
    const [hydrated] = hydrateEdges(
      [edge("output", "input")],
      [
        node("a", "process", { outputs: [{ name: "out" }] }),
        node("b", "process", { inputs: [{ name: "in" }] }),
      ],
      () => undefined,
    );
    expect(hydrated).toMatchObject({ sourceHandle: "out", targetHandle: "in" });
  });

  it("drops an edge from a node to itself", () => {
    const hydrated = hydrateEdges(
      [{ id: "loop", source: "a", sourceHandle: "out", target: "a", targetHandle: "in" } as Edge],
      [node("a", "process")],
      () => undefined,
    );
    expect(hydrated).toEqual([]);
  });

  it("leaves handles alone on nodes with several ports", () => {
    const [hydrated] = hydrateEdges(
      [edge("bam", "reads")],
      [
        node("a", "process", { outputs: [{ name: "bam" }, { name: "log" }] }),
        node("b", "process", { inputs: [{ name: "x" }, { name: "y" }] }),
      ],
      () => undefined,
    );
    expect(hydrated).toMatchObject({ sourceHandle: "bam", targetHandle: "reads" });
  });
});

describe("sanitizeNodesForSave", () => {
  it("keeps small input files and what was selected, without copies", () => {
    const file = { name: "a.txt", size: 3, fileType: "txt", content: "abc" };
    const [saved] = sanitizeNodesForSave([
      node("in", "fileInput", {
        files: [file],
        selectedFilterFiles: [file],
        fileContent: "abc",
        processedContent: "ABC",
      }),
    ]);
    expect(saved.data.files).toEqual([file]);
    expect(saved.data.selectedFilterFiles).toEqual([{ ...file, content: "" }]);
    expect(saved.data.fileContent).toBeUndefined();
    expect(saved.data.processedContent).toBeUndefined();
    expect(saved.data.label).toBe("in");
  });

  it("drops the content of large input files", () => {
    const content = "x".repeat(SAVED_FILE_CONTENT_LIMIT + 1);
    const file = { name: "big.txt", size: content.length, content };
    const [saved] = sanitizeNodesForSave([
      node("in", "fileInput", { files: [file] }),
    ]);
    expect(saved.data.files).toEqual([{ ...file, content: "" }]);
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
  const withTime = (maxTime: string, version?: number) => {
    const { version: _version, ...rest } = DEFAULT_EXECUTION_SETTINGS;
    return {
      ...rest,
      ...(version === undefined ? {} : { version }),
      resources: { ...DEFAULT_EXECUTION_SETTINGS.resources, maxTime },
    };
  };

  it("drops the old 30-minute default from settings saved before versions", () => {
    const migrated = migrateExecutionSettings(withTime("PT30M"));
    expect(migrated.resources.maxTime).toBe("");
    expect(migrated.version).toBe(2);
  });

  it("keeps other limits, and 30 minutes chosen in current settings", () => {
    expect(migrateExecutionSettings(withTime("PT2H")).resources.maxTime).toBe(
      "PT2H",
    );
    expect(
      migrateExecutionSettings(withTime("PT30M", 2)).resources.maxTime,
    ).toBe("PT30M");
  });

  it("migrates the settings kept in browser storage", () => {
    localStorage.setItem("executionSettings", JSON.stringify(withTime("PT30M")));
    expect(readStoredExecutionSettings()?.resources.maxTime).toBe("");
    localStorage.removeItem("executionSettings");
  });

  it("flattens settings for the execute endpoint", () => {
    expect(flattenExecutionSettings(DEFAULT_EXECUTION_SETTINGS)).toEqual({
      useDocker: true,
      containerImage: "ubuntu:22.04",
      outputDirectory: "results",
      outputNaming: "{workflow_name}_{timestamp}",
      maxCpus: 4,
      maxMemory: "4.GB",
      executionTimeout: 0,
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

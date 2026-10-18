import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useFilterOperator } from "./useFilterOperator";

const file = (name: string, content: string): FileObject => ({
  name,
  content,
  size: content.length,
});

const reads = file("reads.txt", "apple pie\nbanana split\napple tart\ncherry");
const notes = file("notes.txt", "note one\nnote two");

/** The last value onSave received for `key`. */
const lastSaved = <K extends keyof NodeData>(
  onSave: ReturnType<typeof vi.fn>,
  key: K,
): NodeData[K] => {
  const calls = onSave.mock.calls.filter(([data]) => key in data);
  return calls[calls.length - 1]?.[0][key];
};

const run = (incoming: FileObject[], nodeData: NodeData) => {
  const onSave = vi.fn();
  const hook = renderHook(
    ({ files, data }) => useFilterOperator(files, data, onSave),
    { initialProps: { files: incoming, data: nodeData } },
  );
  return { onSave, hook };
};

const contentOf = (onSave: ReturnType<typeof vi.fn>) =>
  (lastSaved(onSave, "files") ?? []).map((f) => f.content);

describe("useFilterOperator", () => {
  it("passes files through unchanged without filter text", () => {
    const { onSave } = run([reads, notes], {});
    expect(contentOf(onSave)).toEqual([reads.content, notes.content]);
    expect(lastSaved(onSave, "subtitle")).toBe("Filtered 2 files (unedited)");
  });

  it("keeps lines that contain the text", () => {
    const { onSave } = run([reads], { filterText: "apple" });
    expect(contentOf(onSave)).toEqual(["apple pie\napple tart"]);
    expect(lastSaved(onSave, "files")?.[0].size).toBe(
      "apple pie\napple tart".length,
    );
    expect(lastSaved(onSave, "subtitle")).toBe("Filtered 1 file");
  });

  it("supports starts with, ends with and regex modes", () => {
    expect(
      contentOf(run([reads], { filterText: "ban", filterMode: "startsWith" }).onSave),
    ).toEqual(["banana split"]);
    expect(
      contentOf(run([reads], { filterText: "tart", filterMode: "endsWith" }).onSave),
    ).toEqual(["apple tart"]);
    expect(
      contentOf(run([reads], { filterText: "^c.*y$", filterMode: "matches" }).onSave),
    ).toEqual(["cherry"]);
  });

  it("excludes matches when negated", () => {
    const { onSave } = run([reads], { filterText: "apple", filterNegate: true });
    expect(contentOf(onSave)).toEqual(["banana split\ncherry"]);
  });

  it("drops every line for an invalid regex", () => {
    const { onSave } = run([reads], { filterText: "(", filterMode: "matches" });
    expect(contentOf(onSave)).toEqual([""]);
  });

  it("passes files without content through as empty files", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const empty = { name: "old.txt", content: "", size: 10 };
    const { onSave } = run([empty], { filterText: "x" });
    expect(lastSaved(onSave, "files")).toEqual([
      { name: "old.txt", content: "", size: 0 },
    ]);
    // Files that need a re-upload leave the subtitle to the node.
    expect(lastSaved(onSave, "subtitle")).toBeUndefined();
    warn.mockRestore();
  });

  it("only filters the selected files", () => {
    const { onSave } = run([reads, notes], { selectedFilterFiles: [notes] });
    expect(lastSaved(onSave, "files")?.map((f) => f.name)).toEqual([
      "notes.txt",
    ]);
    // Selecting a subset counts as an edit.
    expect(lastSaved(onSave, "subtitle")).toBe("Filtered 1 file");
  });

  it("clears a selection of files that are no longer incoming", () => {
    const { onSave, hook } = run([reads, notes], {
      selectedFilterFiles: [notes],
    });
    hook.rerender({ files: [reads], data: {} });
    expect(hook.result.current.selectedFiles).toEqual([]);
    expect(lastSaved(onSave, "selectedFilterFiles")).toEqual([]);
    expect(lastSaved(onSave, "files")?.map((f) => f.name)).toEqual([
      "reads.txt",
    ]);
  });

  it("lets the caller change the selection", () => {
    const { onSave, hook } = run([reads, notes], {});
    act(() => hook.result.current.setSelectedFiles([reads]));
    expect(lastSaved(onSave, "selectedFilterFiles")).toEqual([reads]);
    expect(lastSaved(onSave, "files")?.map((f) => f.name)).toEqual([
      "reads.txt",
    ]);
  });

  it("follows a selection loaded into node data", () => {
    const { hook } = run([reads, notes], {});
    hook.rerender({ files: [reads, notes], data: { selectedFilterFiles: [reads] } });
    expect(hook.result.current.selectedFiles).toEqual([reads]);
  });
});

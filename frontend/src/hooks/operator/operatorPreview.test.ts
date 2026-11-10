import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import {
  isOperatorType,
  previewFilter,
  previewMap,
  previewMerge,
  previewSubtitle,
  useOperatorPreview,
} from "./operatorPreview";

const file = (name: string, content?: string): FileObject => ({ name, content, size: content?.length ?? 0 });
const data = (fields: Partial<NodeData>) => ({ label: "Op", ...fields }) as NodeData;
const contents = (files: FileObject[]) => files.map((entry) => entry.content);

const text = file("a.txt", "apple\nbanana\ncherry");

describe("previewFilter", () => {
  it("passes files through unchanged without filter text", () => {
    expect(previewFilter([text], data({}))).toEqual([text]);
  });

  it("keeps the lines that contain, start with, end with or match the text", () => {
    expect(contents(previewFilter([text], data({ filterText: "an" })))).toEqual(["banana"]);
    expect(contents(previewFilter([text], data({ filterText: "ch", filterMode: "startsWith" })))).toEqual(["cherry"]);
    expect(contents(previewFilter([text], data({ filterText: "le", filterMode: "endsWith" })))).toEqual(["apple"]);
    expect(contents(previewFilter([text], data({ filterText: "^b.n", filterMode: "matches" })))).toEqual(["banana"]);
  });

  it("drops the matches when negated, and every line for an invalid regex", () => {
    expect(contents(previewFilter([text], data({ filterText: "an", filterNegate: true })))).toEqual(["apple\ncherry"]);
    expect(contents(previewFilter([text], data({ filterText: "(", filterMode: "matches" })))).toEqual([""]);
  });

  it("passes binary files as they are, and files without content as empty ones", () => {
    const binary = { ...file("reads.fastq.gz", "H4sIAAAA"), encoding: "base64" } as FileObject;
    expect(previewFilter([binary], data({ filterText: "x" }))).toEqual([binary]);
    expect(previewFilter([file("empty.txt")], data({ filterText: "x" }))).toEqual([{ name: "empty.txt", content: "", size: 0 }]);
  });

  it("only filters the selected files", () => {
    const other = file("b.txt", "banana split");
    const result = previewFilter([text, other], data({ filterText: "banana", selectedFilterFiles: [other] }));
    expect(result.map((entry) => entry.name)).toEqual(["b.txt"]);
  });
});

describe("previewMap", () => {
  it("uppercases lines by default, and lowercases them", () => {
    expect(contents(previewMap([file("a", "Ab\ncD")], data({})))).toEqual(["AB\nCD"]);
    expect(contents(previewMap([file("a", "Ab")], data({ mapChangeCase: "toLowerCase" })))).toEqual(["ab"]);
  });

  it("replaces text with a regular expression", () => {
    const replaced = previewMap([file("a", "a1 b2")], data({ mapOperation: "replaceText", mapReplaceFind: "\\d", mapReplaceWith: "#" }));
    expect(contents(replaced)).toEqual(["a# b#"]);
  });

  it("leaves lines alone without find text, for a bad regex or an unknown operation", () => {
    for (const fields of [
      { mapOperation: "replaceText", mapReplaceFind: "" },
      { mapOperation: "replaceText", mapReplaceFind: "(" },
      { mapOperation: "sort" },
    ] as Partial<NodeData>[]) {
      expect(contents(previewMap([file("a", "Ab")], data(fields)))).toEqual(["Ab"]);
    }
  });
});

describe("previewMerge", () => {
  const files = [file("a", "one\ntwo"), file("b", "three")];

  it("collects, counts or joins the lines into one file", () => {
    expect(contents(previewMerge(files, data({})))).toEqual(["one\ntwo\nthree"]);
    expect(contents(previewMerge(files, data({ mergeOperation: "count" })))).toEqual(["File count: 2\nLine count: 3"]);
    expect(contents(previewMerge(files, data({ mergeOperation: "join", mergeJoinSeparator: ", " })))).toEqual([
      "one, two, three",
    ]);
    expect(previewMerge(files, data({}))[0]?.name).toBe("merge_result.txt");
  });

  it("reports an unknown operation", () => {
    expect(contents(previewMerge(files, data({ mergeOperation: "zip" as NodeData["mergeOperation"] })))).toEqual([
      "Error: Unknown merge operation",
    ]);
  });

  it("gives an empty file for files without content, and nothing without files", () => {
    expect(contents(previewMerge([file("a")], data({})))).toEqual([""]);
    expect(previewMerge([], data({}))).toEqual([]);
  });
});

describe("previewSubtitle", () => {
  it("marks unchanged output as unedited, and counts changes and new files as edits", () => {
    expect(previewSubtitle("map", [text], [text])).toBe("Mapped 1 file (unedited)");
    expect(previewSubtitle("map", [file("a.txt", "APPLE")], [text])).toBe("Mapped 1 file");
    expect(previewSubtitle("filter", [text, file("new.txt", "x")], [text])).toBe("Filtered 2 files");
  });

  it("compares a filter's output with the selected files, and counts the selection as filtering", () => {
    const other = file("b.txt", "kiwi");
    expect(previewSubtitle("filter", [other], [text, other], [other])).toBe("Filtered 1 file");
    expect(previewSubtitle("filter", [text], [text], [text])).toBe("Filtered 1 file (unedited)");
  });

  it("describes merges", () => {
    expect(previewSubtitle("merge", [text], [text])).toBe("Merged to 1 file");
    expect(previewSubtitle("merge", [], [])).toBe("Merged (0 files)");
  });
});

describe("useOperatorPreview", () => {
  it("saves the preview and its subtitle", () => {
    const onSave = vi.fn();
    renderHook(() => useOperatorPreview([text], data({ filterText: "an" }), "filter", onSave));
    expect(onSave).toHaveBeenCalledWith({
      files: [{ ...text, content: "banana", size: 6 }],
      subtitle: "Filtered 1 file",
    });
  });

  it("saves only the files without input, or while one must be uploaded again", () => {
    const onSave = vi.fn();
    renderHook(() => useOperatorPreview([], data({}), "map", onSave));
    expect(onSave).toHaveBeenLastCalledWith({ files: [] });
    renderHook(() => useOperatorPreview([file("gone.txt", "")], data({}), "map", onSave));
    expect(onSave).toHaveBeenLastCalledWith({ files: [{ name: "gone.txt", content: "", size: 0 }] });
  });

  it("clears a selection of files that no longer come in", () => {
    const onSave = vi.fn();
    renderHook(() => useOperatorPreview([text], data({ selectedFilterFiles: [file("old.txt", "x")] }), "filter", onSave));
    expect(onSave).toHaveBeenCalledWith({ selectedFilterFiles: [] });
  });

  it("does nothing for other node types", () => {
    const onSave = vi.fn();
    renderHook(() => useOperatorPreview([text], data({}), "sort", onSave));
    renderHook(() => useOperatorPreview([text], data({}), null, onSave));
    expect(onSave).not.toHaveBeenCalled();
    expect(isOperatorType("merge")).toBe(true);
    expect(isOperatorType("sort")).toBe(false);
  });

  it("doesn't make the preview again when only the node's own files change", () => {
    const onSave = vi.fn();
    const incoming = [text];
    const { rerender } = renderHook(({ fields }) => useOperatorPreview(incoming, data(fields), "map", onSave), {
      initialProps: { fields: {} as Partial<NodeData> },
    });
    const calls = onSave.mock.calls.length;
    rerender({ fields: { files: [file("x", "y")], subtitle: "Mapped 1 file" } });
    expect(onSave.mock.calls.length).toBe(calls);
    rerender({ fields: { mapChangeCase: "toLowerCase" } });
    expect(onSave.mock.calls.length).toBe(calls + 1);
  });
});

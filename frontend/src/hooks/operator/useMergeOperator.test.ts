import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useMergeOperator } from "./useMergeOperator";

const file = (name: string, content: string): FileObject => ({
  name,
  content,
  size: content.length,
});

const merge = (incoming: FileObject[], nodeData: NodeData) => {
  const onSave = vi.fn();
  renderHook(() => useMergeOperator(incoming, nodeData, onSave));
  return onSave.mock.calls[onSave.mock.calls.length - 1][0] as Partial<NodeData>;
};

const first = file("a.txt", "one\ntwo\n");
const second = file("b.txt", "three");

describe("useMergeOperator", () => {
  it("collects all lines into one file", () => {
    const saved = merge([first, second], {});
    expect(saved.files).toEqual([
      { name: "merge_result.txt", content: "one\ntwo\nthree", size: 13 },
    ]);
    expect(saved.subtitle).toBe("Merged to 1 file");
  });

  it("counts files and lines", () => {
    const saved = merge([first, second], { mergeOperation: "count" });
    expect(saved.files?.[0].content).toBe("File count: 2\nLine count: 3");
  });

  it("joins lines with the separator", () => {
    expect(
      merge([first, second], { mergeOperation: "join", mergeJoinSeparator: ", " })
        .files?.[0].content,
    ).toBe("one, two, three");
    // The default separator "\n" is typed as backslash-n.
    expect(
      merge([first, second], { mergeOperation: "join" }).files?.[0].content,
    ).toBe("one\ntwo\nthree");
  });

  it("reports an unknown operation", () => {
    expect(
      merge([first], { mergeOperation: "zip" }).files?.[0].content,
    ).toBe("Error: Unknown merge operation");
  });

  it("produces an empty result for files without content", () => {
    const saved = merge([{ name: "x.txt", content: "", size: 3 }], {});
    expect(saved.files).toEqual([
      { name: "merge_result.txt", content: "", size: 0 },
    ]);
  });

  it("produces nothing without incoming files", () => {
    expect(merge([], {})).toEqual({ files: [] });
  });
});

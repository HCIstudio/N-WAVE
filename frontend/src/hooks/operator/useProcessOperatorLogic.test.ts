import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject } from "../../components/nodes/BaseNode";
import { useProcessOperatorLogic } from "./useProcessOperatorLogic";

const file = (name: string, content: string): FileObject => ({
  name,
  content,
  size: content.length,
});

const subtitle = (
  processed: FileObject[],
  operatorType: string,
  incoming?: FileObject[],
  selected?: FileObject[],
) => {
  const onSave = vi.fn();
  renderHook(() =>
    useProcessOperatorLogic(processed, operatorType, onSave, incoming, selected),
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ files: processed }),
  );
  return onSave.mock.calls[0][0].subtitle;
};

const a = file("a.txt", "alpha");
const b = file("b.txt", "beta");

describe("useProcessOperatorLogic", () => {
  it("saves only the files without input or with files to re-upload", () => {
    expect(subtitle([a], "map")).toBeUndefined();
    expect(subtitle([a], "map", [])).toBeUndefined();
    expect(subtitle([a], "map", [{ name: "a.txt", content: " ", size: 0 }])).toBeUndefined();
  });

  it("marks unchanged output as unedited", () => {
    expect(subtitle([a, b], "map", [a, b])).toBe("Mapped 2 files (unedited)");
    expect(subtitle([a], "filter", [a])).toBe("Filtered 1 file (unedited)");
  });

  it("counts changed content and new files as edits", () => {
    expect(subtitle([file("a.txt", "ALPHA")], "map", [a])).toBe("Mapped 1 file");
    expect(subtitle([file("c.txt", "alpha")], "map", [a])).toBe("Mapped 1 file");
  });

  it("compares filter output against the selected files", () => {
    // Selecting fewer files than come in is already a filter.
    expect(subtitle([a], "filter", [a, b], [a])).toBe("Filtered 1 file");
    // Saved selections may lack content; output with content is then edited.
    expect(
      subtitle([a], "filter", [a], [{ name: "a.txt", content: "", size: 0 }]),
    ).toBe("Filtered 1 file");
  });

  it("names other operators in the past tense", () => {
    expect(subtitle([file("a.txt", "x")], "sort", [a])).toBe("Sorted 1 file");
  });

  it("describes merges", () => {
    expect(subtitle([file("merge_result.txt", "x")], "merge", [a])).toBe(
      "Merged to 1 file",
    );
    expect(subtitle([], "merge", [a])).toBe("Merged (0 files)");
  });
});

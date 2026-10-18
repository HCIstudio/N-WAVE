import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject } from "../../components/nodes/BaseNode";
import { registerOperatorHook } from "./operatorRegistry";
import { useOperatorLogic } from "./useOperatorLogic";

const files: FileObject[] = [{ name: "a.txt", content: "a\nb", size: 3 }];

describe("useOperatorLogic", () => {
  it("does nothing without a known operator type", () => {
    const onSave = vi.fn();
    expect(
      renderHook(() => useOperatorLogic(files, {}, null, onSave)).result.current,
    ).toBeNull();
    expect(
      renderHook(() => useOperatorLogic(files, {}, "unknown", onSave)).result
        .current,
    ).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("runs the operator's hook", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useOperatorLogic(files, { filterText: "b" }, "filter", onSave),
    );
    expect(result.current).toEqual(
      expect.objectContaining({ selectedFiles: [] }),
    );
    expect(onSave).toHaveBeenCalledWith({
      files: [{ name: "a.txt", content: "b", size: 1 }],
      subtitle: "Filtered 1 file",
    });
  });

  it("passes files, node data and a save callback to registered hooks", () => {
    const hook = vi.fn((_files, _data, save: (data: object) => void) => {
      save({ subtitle: "Sorted" });
      return "sorted";
    });
    registerOperatorHook("sort", hook);
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useOperatorLogic(files, { label: "Sort" }, "sort", onSave),
    );
    expect(result.current).toBe("sorted");
    expect(hook).toHaveBeenCalledWith(files, { label: "Sort" }, expect.any(Function));
    expect(onSave).toHaveBeenCalledWith({ subtitle: "Sorted" });
  });
});

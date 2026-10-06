import { describe, expect, it } from "vitest";
import { isNodeDataPatchNoop } from "./nodeData";

describe("isNodeDataPatchNoop", () => {
  const data = {
    label: "Filter",
    subtitle: "Filtered 1 file",
    files: [{ name: "a.txt", content: "hello", size: 5 }],
  };

  it("detects patches that change nothing", () => {
    expect(isNodeDataPatchNoop(data, {})).toBe(true);
    expect(isNodeDataPatchNoop(data, { subtitle: "Filtered 1 file" })).toBe(true);
    // A structurally equal, freshly built array is not a change.
    expect(
      isNodeDataPatchNoop(data, {
        files: [{ name: "a.txt", content: "hello", size: 5 }],
      })
    ).toBe(true);
    expect(isNodeDataPatchNoop(data, { note: undefined })).toBe(true);
  });

  it("detects real changes", () => {
    expect(isNodeDataPatchNoop(data, { subtitle: "Filtered 2 files" })).toBe(false);
    expect(
      isNodeDataPatchNoop(data, {
        files: [{ name: "a.txt", content: "HELLO", size: 5 }],
      })
    ).toBe(false);
    expect(isNodeDataPatchNoop(data, { note: "new" })).toBe(false);
  });
});

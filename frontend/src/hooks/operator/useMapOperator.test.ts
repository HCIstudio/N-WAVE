import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useMapOperator } from "./useMapOperator";

const file = (name: string, content: string): FileObject => ({
  name,
  content,
  size: content.length,
});

const map = (incoming: FileObject[], nodeData: NodeData) => {
  const onSave = vi.fn();
  renderHook(() => useMapOperator(incoming, nodeData, onSave));
  const last = onSave.mock.calls[onSave.mock.calls.length - 1][0];
  return last as Partial<NodeData>;
};

const lines = file("a.txt", "Hello World\n\nfoo bar");

describe("useMapOperator", () => {
  it("uppercases lines by default", () => {
    const saved = map([lines], {});
    expect(saved.files?.[0].content).toBe("HELLO WORLD\n\nFOO BAR");
    expect(saved.subtitle).toBe("Mapped 1 file");
  });

  it("lowercases lines", () => {
    const saved = map([lines], { mapChangeCase: "toLowerCase" });
    expect(saved.files?.[0].content).toBe("hello world\n\nfoo bar");
  });

  it("replaces text using a regex", () => {
    const saved = map([lines], {
      mapOperation: "replaceText",
      mapReplaceFind: "o+",
      mapReplaceWith: "0",
    });
    expect(saved.files?.[0].content).toBe("Hell0 W0rld\n\nf0 bar");
  });

  it("leaves lines alone without find text, for a bad regex or an unknown operation", () => {
    for (const data of [
      { mapOperation: "replaceText", mapReplaceFind: "" },
      { mapOperation: "replaceText", mapReplaceFind: "[" },
      { mapOperation: "reverse" },
    ]) {
      const saved = map([lines], data);
      expect(saved.files?.[0].content).toBe(lines.content);
      expect(saved.subtitle).toBe("Mapped 1 file (unedited)");
    }
  });

  it("maps files without content to empty files", () => {
    const saved = map([{ name: "b.txt", content: "", size: 4 }], {});
    expect(saved.files).toEqual([{ name: "b.txt", content: "", size: 0 }]);
  });

  it("saves no subtitle without incoming files", () => {
    expect(map([], {})).toEqual({ files: [] });
  });
});

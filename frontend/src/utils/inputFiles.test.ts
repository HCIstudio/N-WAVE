import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { makeNode } from "../test/nodes";
import { getWorkflowInputFiles, isFileContentMissing } from "./inputFiles";

const fileInput = (id: string, content: string, name = "reads.fq") =>
  ({
    ...makeNode("fileInput", {
      files: [{ name, size: content.length, content }],
    }),
    id,
  }) as Node<NodeData>;

describe("getWorkflowInputFiles", () => {
  it("keeps one copy of a file two nodes share", () => {
    expect(
      getWorkflowInputFiles([fileInput("a", "x"), fileInput("b", "x")]),
    ).toEqual([{ name: "reads.fq", content: "x" }]);
  });

  it("refuses two different files with the same name", () => {
    expect(() =>
      getWorkflowInputFiles([fileInput("a", "x"), fileInput("b", "y")]),
    ).toThrow('Two input files are named "reads.fq" but differ.');
  });

  it("refuses names that differ only in case", () => {
    // The same file on macOS and Windows.
    expect(() =>
      getWorkflowInputFiles([fileInput("a", "x", "Sample.fq"), fileInput("b", "y", "sample.fq")]),
    ).toThrow('"Sample.fq" and "sample.fq" differ only in upper and lower case.');
  });

  it("refuses names starting with a dash", () => {
    expect(() => getWorkflowInputFiles([fileInput("a", "x", "-lead.txt")])).toThrow(
      "can't start with",
    );
  });
});

describe("isFileContentMissing", () => {
  it("tells a file whose content wasn't kept from an empty file", () => {
    expect(isFileContentMissing({ size: 300_000, content: "" })).toBe(true);
    expect(isFileContentMissing({ size: 0, content: "" })).toBe(false);
    expect(isFileContentMissing({ size: 2, content: "\n\n" })).toBe(false);
  });
});

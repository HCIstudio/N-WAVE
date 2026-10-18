import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { makeNode } from "../test/nodes";
import { getWorkflowInputFiles } from "./inputFiles";

const fileInput = (id: string, content: string) =>
  ({
    ...makeNode("fileInput", {
      files: [{ name: "reads.fq", size: content.length, content }],
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
});

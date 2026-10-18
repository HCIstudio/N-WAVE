import { describe, expect, it } from "vitest";
import { helperFunctionsFor } from "../generators/core/helpers";
import { makeNode } from "../test/nodes";
import {
  createStoredCustomNode,
  parseCustomNodeSource,
  registerCustomNodes,
} from "./customNodes";
import { getNodeCode } from "./nodeCode";

const source = [
  "process TRIM_READS {",
  "  input:",
  "  tuple val(meta), path(reads)",
  "  output:",
  "  tuple val(meta), path('*.fq.gz'), emit: reads",
  "  script:",
  '  """',
  "  trim ${reads}",
  '  """',
  "}",
].join("\n");

describe("custom node tuple inputs", () => {
  it("take their files through a top-level helper (strict syntax)", () => {
    const parsed = parseCustomNodeSource(source);
    const trimReads = createStoredCustomNode(
      { label: "Trim reads", description: "", icon: "Code", source },
      parsed,
      { inputs: parsed.inputs, outputs: parsed.outputs },
    );
    registerCustomNodes([trimReads]);

    const snippet = getNodeCode(makeNode(trimReads.id))?.workflowSnippet ?? "";
    expect(snippet).toContain("def firstPath = nwaveLastOf(");
    expect(snippet).toContain("tuple(meta, nwaveLastOf(");
    // A closure called like a function isn't valid strict syntax.
    expect(snippet).not.toMatch(/def \w+ = \{ item ->/);
    expect(helperFunctionsFor(snippet).join("\n")).toContain(
      "def nwaveLastOf(item) {",
    );
  });

  it("skip malformed stored arguments instead of crashing", () => {
    const parsed = parseCustomNodeSource(source);
    const node = createStoredCustomNode(
      { label: "Trim reads", description: "", icon: "Code", source },
      parsed,
      { inputs: parsed.inputs, outputs: parsed.outputs },
    );
    registerCustomNodes([node]);
    const expected = getNodeCode(makeNode(node.id));
    const broken = {
      ...node,
      arguments: [
        null,
        { kind: "tuple", name: "x" },
        ...node.arguments,
      ] as unknown as typeof node.arguments,
    };
    registerCustomNodes([broken]);
    expect(getNodeCode(makeNode(node.id))).toEqual(expected);
  });
});

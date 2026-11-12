import { describe, expect, it } from "vitest";
import { NODE_KIND_ORDER, NODE_KINDS, nodeKindOf } from "./nodeKinds";

describe("nodeKindOf", () => {
  it.each([
    ["fileInput", undefined, "input"],
    ["samplesheet", undefined, "input"],
    ["parameters", undefined, "input"],
    ["process", "nfcore_fastqc", "nfcore"],
    ["process", "nfcore_subworkflow_bam_stats", "nfcore"],
    ["pipeline", undefined, "nfcore"],
    ["process", "custom_tool", "custom"],
    ["operator", undefined, "operator"],
    ["filter", undefined, "operator"],
    ["channelOperator", undefined, "operator"],
    ["outputDisplay", undefined, "output"],
  ])("puts a %s node (%s) among %s", (type, processType, kind) => {
    expect(nodeKindOf({ type, data: { processType } })).toBe(kind);
  });

  it("gives notes no kind", () => {
    expect(nodeKindOf({ type: "note", data: {} })).toBeNull();
  });
});

describe("NODE_KINDS", () => {
  it("tells every kind apart by its shape as well as its color", () => {
    const shapes = NODE_KIND_ORDER.map((kind) => NODE_KINDS[kind].shape);
    const colors = NODE_KIND_ORDER.map((kind) => NODE_KINDS[kind].color);
    expect(new Set(shapes).size).toBe(NODE_KIND_ORDER.length);
    expect(new Set(colors).size).toBe(NODE_KIND_ORDER.length);
  });
});

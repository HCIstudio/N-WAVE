import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeNode } from "../test/nodes";
import {
  buildConvertedNode,
  buildCustomNodeFromNode,
  mapPorts,
  remapEdges,
  toProcessName,
} from "./convertToCustomNode";
import { registerCustomNodes, stripLineComment } from "./customNodes";
import { getNodeCode } from "./nodeCode";

const convert = (definitionId: string, moduleSource?: string) => {
  const node = makeNode(definitionId);
  const code = getNodeCode(node);
  if (!code) throw new Error("no code");
  const conversion = buildCustomNodeFromNode(node, code, moduleSource);
  registerCustomNodes([conversion.customNode]);
  const converted = buildConvertedNode(node, conversion.customNode);
  return {
    node,
    code,
    conversion,
    converted,
    convertedCode: getNodeCode(converted),
  };
};

/** Process body without its name, for comparing generated processes. */
const body = (source: string) => source.replace(/^process \w+ \{/, "process {");

describe("convert to custom node", () => {
  it.each(["filter", "map", "merge", "outputDisplay"])(
    "keeps the %s node's process and wiring",
    (id) => {
      const { code, conversion, converted, convertedCode } = convert(id);
      expect(converted.data.customNodeId).toBe(conversion.customNode.id);
      expect(convertedCode?.isCustom).toBe(true);
      expect(body(convertedCode?.processSource ?? "")).toBe(
        body(code.processSource),
      );
      // The single input port maps to the process's path input.
      expect(Object.keys(conversion.ports.inputs)).toEqual(["in"]);
    },
  );

  it("keeps Merge collecting all files into one task", () => {
    const { convertedCode } = convert("merge");
    expect(convertedCode?.workflowSnippet).toMatch(/\(\w+\.collect\(\)\)/);
  });

  it("converts an nf-core node from its module source", () => {
    const moduleSource = readFileSync(
      // nf-core/modules fastqc at the catalog's pinned commit.
      join(__dirname, "../test/fixtures/nfcore-fastqc.main.nf"),
      "utf8",
    );
    const { conversion, convertedCode } = convert("fastqc", moduleSource);

    expect(conversion.customNode.processName).toBe("FASTQC");
    expect(conversion.customNode.config).toEqual(["ext.args = '--kmers 7'"]);
    expect(conversion.ports).toEqual({
      inputs: { reads: "reads" },
      outputs: { html: "html", zip: "zip", versions: "versions_fastqc" },
    });
    expect(convertedCode?.processSource).toContain("fastqc");
    expect(convertedCode?.configBlocks.join("\n")).toContain(
      "ext.args = '--kmers 7'",
    );
  });

  it("refuses nf-core nodes without module source", () => {
    const node = makeNode("fastqc");
    const code = getNodeCode(node);
    if (!code) throw new Error("no code");
    expect(() => buildCustomNodeFromNode(node, code)).toThrow(
      /No Nextflow code/,
    );
  });
});

describe("port mapping", () => {
  it("prefers names, then prefixes, then positions", () => {
    expect(mapPorts(["a", "versions"], ["versions_tool", "a"])).toEqual({
      a: "a",
      versions: "versions_tool",
    });
    expect(mapPorts(["in"], ["input_file"])).toEqual({ in: "input_file" });
    expect(mapPorts(["x", "y"], ["z"])).toEqual({});
  });

  it("remaps edges and reports the ones that can't be kept", () => {
    const edges = [
      {
        id: "1",
        source: "up",
        target: "n",
        sourceHandle: "out",
        targetHandle: "in",
      },
      {
        id: "2",
        source: "n",
        target: "down",
        sourceHandle: "out",
        targetHandle: "in",
      },
      {
        id: "3",
        source: "n",
        target: "other",
        sourceHandle: "gone",
        targetHandle: "in",
      },
      { id: "4", source: "a", target: "b" },
    ];
    const { edges: kept, removed } = remapEdges(edges, "n", {
      inputs: { in: "input_file" },
      outputs: { out: "out" },
    });
    expect(
      kept.map((edge) => [edge.id, edge.sourceHandle, edge.targetHandle]),
    ).toEqual([
      ["1", "out", "input_file"],
      ["2", "out", "in"],
      ["4", undefined, undefined],
    ]);
    expect(removed.map((edge) => edge.id)).toEqual(["3"]);
  });

  it("builds valid process names", () => {
    expect(toProcessName("Trim Galore!")).toBe("TRIM_GALORE");
    expect(toProcessName("2nd step")).toBe("PROCESS_2ND_STEP");
  });
});

describe("stripLineComment", () => {
  it("ignores // inside strings", () => {
    expect(
      stripLineComment(`eval('sed "s/.*v//"'), emit: versions // note`),
    ).toBe(`eval('sed "s/.*v//"'), emit: versions `);
    expect(stripLineComment("path x // comment")).toBe("path x ");
    expect(stripLineComment('val "a\\"//b"')).toBe('val "a\\"//b"');
  });
});

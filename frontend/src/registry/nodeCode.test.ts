import { describe, expect, it } from "vitest";
import { makeNode } from "../test/nodes";
import { getNodeCode } from "./nodeCode";

describe("getNodeCode", () => {
  it("returns the inline process of a Filter node", () => {
    const code = getNodeCode(makeNode("filter", { filterText: "hello" }));
    expect(code?.processName).toBe("filter_node_filter");
    expect(code?.processSource).toMatch(/^process filter_node_filter \{/);
    expect(code?.processSource).toContain('grep  "hello"');
    expect(code?.nfCoreModule).toBeUndefined();
    expect(code?.workflowSnippet).toContain("filter_node_filter(in_ch)");
  });

  it.each(["map", "merge", "outputDisplay"])(
    "returns an inline process for %s nodes",
    (id) => {
      const code = getNodeCode(makeNode(id));
      expect(code?.processSource).toMatch(/^process \w+ \{/);
      expect(code?.isCustom).toBe(false);
    },
  );

  it("references the nf-core module of an nf-core node", () => {
    const code = getNodeCode(makeNode("fastqc", { nogroup: true }));
    expect(code?.processSource).toBe("");
    expect(code?.nfCoreModule).toEqual({
      id: "nf-core/fastqc",
      processName: "FASTQC",
      modulePath: "./modules/nf-core/fastqc/main",
    });
    expect(code?.includeStatements[0]).toMatch(/^include \{ FASTQC as /);
    expect(code?.configBlocks.join("\n")).toContain(
      "ext.args = '--nogroup --kmers 7'",
    );
    expect(code?.workflowSnippet).toContain("reads_ch.map");
  });

  it("returns null for nodes that don't generate a process", () => {
    expect(getNodeCode(makeNode("fileInput"))).toBeNull();
  });
});

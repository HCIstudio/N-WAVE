import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import catalog from "../registry/nfcore/catalog.json";

const source = readFileSync(join(__dirname, "../test/fixtures/nfcore-bam_sort_stats_samtools.main.nf"), "utf8");
vi.mock("../api/nfcore", () => ({
  getNfCoreCatalog: async () => catalog,
  getNfCoreModuleSource: async () => source,
}));
const { buildSubworkflowCopy } = await import("./copySubworkflowWorkflow");
const { getNodeDefinitionForNode } = await import("../registry/nodeDefinitions");

describe("buildSubworkflowCopy", () => {
  it("drafts an editable workflow from the subworkflow, with its steps ready to generate", async () => {
    const draft = await buildSubworkflowCopy("nf-core/subworkflows/bam_sort_stats_samtools");
    expect(draft).toMatchObject({
      name: "BAM_SORT_STATS_SAMTOOLS (copy)",
      sourceKey: "nf-core/subworkflows/bam_sort_stats_samtools",
      rawSource: source,
      isReadOnly: false,
      originType: "imported",
    });
    expect(draft.importWarnings).toEqual([expect.stringMatching(/modules\.config/)]);
    const sort = draft.nodes.find((node) => node.data.label === "SAMTOOLS_SORT");
    expect(sort && getNodeDefinitionForNode(sort)?.generateNextflow).toBeTypeOf("function");
  });

  it("says when the subworkflow isn't in the catalog", async () => {
    await expect(buildSubworkflowCopy("nf-core/subworkflows/nope")).rejects.toThrow(/isn't in the nf-core catalog/);
  });
});

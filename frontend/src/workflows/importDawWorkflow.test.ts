import { describe, expect, it, vi } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import { serializeDawModel, toDawModel, withoutNwaveData } from "../metamodel/toDawModel";
import catalog from "../registry/nfcore/catalog.json";
import { getNodeDefinitionForNode } from "../registry/nodeDefinitions";

const getNfCoreCatalog = vi.fn();
vi.mock("../api/nfcore", () => ({ getNfCoreCatalog: () => getNfCoreCatalog() }));

const { importDawWorkflow } = await import("./importDawWorkflow");

const fixture = (name: string) => buildLintFixtures().find((candidate) => candidate.name === name) as ReturnType<typeof buildLintFixtures>[number];

describe("importDawWorkflow", () => {
  it("gives a model N-WAVE wrote back as a workflow, with its settings over the defaults", async () => {
    const demo = fixture("demo-1-text-basics");
    const source = serializeDawModel(
      toDawModel({ nodes: demo.nodes, edges: demo.edges, workflowName: "Demo 1", description: "Text basics", settings: { output: { directory: "out" } } }),
    );
    const draft = await importDawWorkflow({ source, sourceKey: "demo.daw.json" });
    expect(draft).toMatchObject({
      name: "Demo 1",
      description: "Text basics",
      originType: "imported",
      sourceFormat: "visual",
      rawSource: null,
      sourceKey: "demo.daw.json",
      importWarnings: [],
    });
    expect(draft.nodes).toHaveLength(demo.nodes.length);
    expect(draft.edges).toHaveLength(demo.edges.length);
    expect(draft.executionSettings.output).toEqual({ directory: "out" });
    expect(draft.executionSettings.mode).toBeDefined();
    expect(getNfCoreCatalog).not.toHaveBeenCalled();
    // The name and description typed in the dialog win.
    expect(await importDawWorkflow({ source, name: " Mine ", description: "My copy" })).toMatchObject({ name: "Mine", description: "My copy" });
  });

  it("loads the nf-core catalog for a model that refers to nf-core, and registers its nodes", async () => {
    getNfCoreCatalog.mockResolvedValue(catalog);
    const chain = fixture("nfcore-subworkflow-chain");
    const source = serializeDawModel(withoutNwaveData(toDawModel({ nodes: chain.nodes, edges: chain.edges, workflowName: "Chain" })));
    const draft = await importDawWorkflow({ source });
    expect(getNfCoreCatalog).toHaveBeenCalledTimes(1);
    expect(draft.importWarnings.filter((warning) => /placeholder/.test(warning))).toEqual([]);
    const align = draft.nodes.find((node) => node.data.nwaveNfCoreModuleId === "nf-core/subworkflows/fastq_align_bwa");
    expect(align && getNodeDefinitionForNode(align)?.generateNextflow).toBeDefined();
  });

  it("still opens the model when the catalog can't be loaded, and says so", async () => {
    getNfCoreCatalog.mockRejectedValue(new Error("offline"));
    const chain = fixture("nfcore-subworkflow-chain");
    const source = serializeDawModel(withoutNwaveData(toDawModel({ nodes: chain.nodes, edges: chain.edges, workflowName: "Chain" })));
    const draft = await importDawWorkflow({ source });
    expect(draft.importWarnings.some((warning) => /are placeholders/.test(warning))).toBe(true);
    expect(draft.importWarnings).toContain("The nf-core catalog couldn't be loaded, so nf-core modules in the model aren't recognized.");
    expect(draft.nodes.filter((node) => node.data.placeholder === true)).toHaveLength(3);
  });

  it("refuses what isn't a DAW model", async () => {
    await expect(importDawWorkflow({ source: "{}" })).rejects.toThrow("isn't a DAW model");
  });
});

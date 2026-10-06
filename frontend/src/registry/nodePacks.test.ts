import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeNode } from "../test/nodes";
import {
  createStoredCustomNode,
  parseCustomNodeSource,
  registerCustomNodes,
  type StoredCustomNode,
} from "./customNodes";
import { getNodeCode } from "./nodeCode";
import {
  buildNodePack,
  findPackConflicts,
  groupInstalledPacks,
  NODE_PACK_FORMAT,
  nfCoreInstallIds,
  nodePackFileName,
  type PackedCustomNode,
  parseNodePack,
  parseNodePackIndex,
  resolvePackImport,
  serializeNodePack,
  toPackId,
  withNewNodeId,
} from "./nodePacks";

const customNode = (
  source: string,
  label: string,
  edit: (node: StoredCustomNode) => StoredCustomNode = (node) => node,
): StoredCustomNode => {
  const parsed = parseCustomNodeSource(source);
  return edit(
    createStoredCustomNode(
      { label, description: `${label} node`, icon: "Code", source },
      parsed,
      { inputs: parsed.inputs, outputs: parsed.outputs },
    ),
  );
};

const trimReads = customNode(
  [
    "process TRIM_READS {",
    "  input:",
    "  tuple val(meta), path(reads)",
    "  val min_length",
    "  output:",
    "  tuple val(meta), path('*.trimmed.fq.gz'), emit: reads",
    "  path 'versions.yml', emit: versions",
    "  script:",
    '  """',
    "  trim --min ${min_length} ${reads}",
    '  """',
    "}",
  ].join("\n"),
  "Trim reads",
  (node) => ({
    ...node,
    inputs: node.inputs.map((input) =>
      input.name === "min_length"
        ? {
            ...input,
            label: "Minimum length",
            settingType: "integer",
            defaultValue: "20",
          }
        : input,
    ),
    config: ["ext.args = '--quality 30'"],
  }),
);

const bamStats = customNode(
  readFileSync(
    join(__dirname, "../test/fixtures/nfcore-bam_sort_stats_samtools.main.nf"),
    "utf8",
  ),
  "BAM sort and stats",
);

const pack = buildNodePack(
  {
    name: "RNA-seq extras",
    version: "1.0.0",
    description: "Trimming and BAM stats",
    author: "N-WAVE tests",
    createdWith: "N-WAVE 1.2.10",
  },
  [trimReads, bamStats],
);

/** A pack file with its first node changed. */
const withNode = (change: (node: Record<string, unknown>) => void) => {
  const copy = JSON.parse(serializeNodePack(pack));
  change(copy.nodes[0]);
  return JSON.stringify(copy);
};

describe("node pack format", () => {
  it("writes a versioned pack with each node's source, ports and nf-core references", () => {
    expect(pack).toMatchObject({
      format: NODE_PACK_FORMAT,
      formatVersion: 1,
      id: "rna-seq-extras",
      name: "RNA-seq extras",
      version: "1.0.0",
      createdWith: "N-WAVE 1.2.10",
    });
    expect(pack.nodes[0]).toMatchObject({
      id: trimReads.id,
      label: "Trim reads",
      processName: "TRIM_READS",
      config: ["ext.args = '--quality 30'"],
    });
    expect(pack.nodes[0]).not.toHaveProperty("createdAt");
    expect(pack.nodes[0]).not.toHaveProperty("nfcore");
    expect(pack.nodes[1]).toMatchObject({
      kind: "workflow",
      processName: "BAM_SORT_STATS_SAMTOOLS",
      nfcore: {
        modules: ["samtools/index", "samtools/sort"],
        subworkflows: ["bam_stats_samtools"],
      },
    });
    expect(
      nfCoreInstallIds(
        pack.nodes[1].nfcore ?? { modules: [], subworkflows: [] },
      ),
    ).toEqual([
      "nf-core/samtools/index",
      "nf-core/samtools/sort",
      "nf-core/subworkflows/bam_stats_samtools",
    ]);
    expect(nodePackFileName(pack)).toBe("rna-seq-extras-1.0.0.nwave-pack.json");
    expect(toPackId("  My Pack!! v2 ")).toBe("my-pack-v2");
  });

  it("imports into another install and generates the same code", () => {
    registerCustomNodes([trimReads, bamStats]);
    const before = [trimReads, bamStats].map((node) =>
      getNodeCode(makeNode(node.id)),
    );

    const parsed = parseNodePack(serializeNodePack(pack));
    expect(parsed.errors).toEqual([]);
    expect(parsed.pack).toMatchObject({
      id: "rna-seq-extras",
      version: "1.0.0",
    });
    expect(parsed.nodes.map((node) => node.errors)).toEqual([[], []]);
    const imported = parsed.nodes.map((node) => node.node as PackedCustomNode);
    expect(imported[0].pack).toEqual({
      id: "rna-seq-extras",
      name: "RNA-seq extras",
      version: "1.0.0",
    });
    expect(imported[0].inputs).toEqual(trimReads.inputs);
    expect(imported[0].arguments).toEqual(trimReads.arguments);

    // As if registered from a fresh store: same ids, same definitions.
    registerCustomNodes(imported);
    const after = imported.map((node) => getNodeCode(makeNode(node.id)));
    expect(after).toEqual(before);
    expect(after[1]?.includeStatements).toContain(
      "include { SAMTOOLS_SORT } from './modules/nf-core/samtools/sort/main'",
    );
  });

  it("rejects files that aren't packs, with a reason", () => {
    expect(parseNodePack("{nope").errors[0]).toMatch(/isn't valid JSON/);
    expect(parseNodePack("[]").errors).toEqual([
      "A node pack must be a JSON object.",
    ]);
    expect(parseNodePack('{"format":"other"}').errors[0]).toMatch(
      /isn't an N-WAVE node pack/,
    );
    expect(
      parseNodePack(JSON.stringify({ ...pack, formatVersion: 2 })).errors[0],
    ).toMatch(/format version 2; this N-WAVE reads up to version 1/);
    expect(
      parseNodePack(
        JSON.stringify({
          format: NODE_PACK_FORMAT,
          formatVersion: 1,
          id: "Bad Id",
          nodes: [],
        }),
      ).errors,
    ).toEqual([
      'Pack: "name" is required.',
      'Pack: "version" is required.',
      '"Bad Id" isn\'t a valid pack id (lowercase letters, digits, "-", "_", ".").',
      "The pack has no nodes.",
    ]);
  });

  it("reports errors per node and keeps the valid ones", () => {
    const parsed = parseNodePack(
      withNode((node) => {
        node.processName = "TRIM";
        node.inputs = [
          { name: "reads", kind: "path" },
          { name: "reads", kind: "file" },
          { name: "extra", kind: "val", settingType: "colour" },
        ];
        node.outputs = [{ name: "out", emit: "missing" }];
      }),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes[0].node).toBeUndefined();
    expect(parsed.nodes[0].errors).toEqual([
      'Input 2 (reads): "kind" must be "path" or "val".',
      'Input 3 (extra): "settingType" must be one of text, integer, float, boolean, select, expression.',
      'The source declares process TRIM_READS, but "processName" is TRIM.',
      'Input "reads" is listed twice.',
    ]);
    expect(parsed.nodes[1].errors).toEqual([]);
    expect(parsed.nodes[1].node?.id).toBe(bamStats.id);

    const ports = parseNodePack(
      withNode((node) => {
        node.inputs = [{ name: "adapters", kind: "path" }];
        node.outputs = [{ name: "out", emit: "missing" }];
      }),
    ).nodes[0];
    expect(ports.errors).toEqual([
      'Input "adapters" isn\'t declared in the source.',
      'Output "out" emits "missing", which the source doesn\'t declare.',
    ]);

    const empty = parseNodePack(
      withNode((node) => {
        node.id = "bad id";
        node.source = "echo hello";
      }),
    ).nodes[0];
    expect(empty.errors).toEqual([
      '"bad id" isn\'t a valid node id (letters, digits, "_", "-", "."; up to 120 characters).',
      "The source declares no process or named workflow.",
    ]);
  });

  it("rejects duplicate ids inside a pack", () => {
    const copy = JSON.parse(serializeNodePack(pack));
    copy.nodes[1] = { ...copy.nodes[0] };
    const parsed = parseNodePack(JSON.stringify(copy));
    expect(parsed.nodes[0].node).toBeDefined();
    expect(parsed.nodes[1].node).toBeUndefined();
    expect(parsed.nodes[1].errors).toEqual([
      `Another node in the pack has the id "${trimReads.id}".`,
    ]);
  });

  it("adds nf-core components the source includes but the pack doesn't list", () => {
    const copy = JSON.parse(serializeNodePack(pack));
    copy.nodes[1].nfcore = undefined;
    const [, workflow] = parseNodePack(JSON.stringify(copy)).nodes;
    expect(workflow.errors).toEqual([]);
    expect(workflow.warnings[0]).toMatch(
      /doesn't list: samtools\/index, samtools\/sort, bam_stats_samtools\./,
    );
    expect(workflow.nfcore.subworkflows).toEqual(["bam_stats_samtools"]);
  });
});

describe("installed packs", () => {
  const imported = parseNodePack(serializeNodePack(pack)).nodes.map(
    (node) => node.node as PackedCustomNode,
  );
  const local: PackedCustomNode = { ...trimReads, id: "local_node" };

  it("groups installed nodes by pack", () => {
    expect(groupInstalledPacks([local, ...imported])).toEqual([
      {
        id: "rna-seq-extras",
        name: "RNA-seq extras",
        version: "1.0.0",
        nodes: imported,
      },
    ]);
  });

  it("finds id conflicts and where the existing node came from", () => {
    const other = {
      ...imported[1],
      pack: { id: "other", name: "Other", version: "1" },
    };
    const conflicts = findPackConflicts(imported, [
      { ...imported[0] },
      other,
      local,
    ]);
    expect(
      conflicts.map((conflict) => [
        conflict.incoming.id,
        conflict.existingSource,
      ]),
    ).toEqual([
      [trimReads.id, "same-pack"],
      [bamStats.id, "other-pack"],
    ]);
    expect(
      findPackConflicts([{ ...imported[0], id: "local_node" }], [local])[0]
        .existingSource,
    ).toBe("local");
  });

  it("applies the conflict choices: replace, keep both, skip", () => {
    const installed = [
      { ...imported[0], createdAt: "2020-01-01T00:00:00.000Z" },
      { ...imported[1], pack: undefined },
    ];
    // Defaults: update the pack's own node, keep both for a local one.
    const defaults = resolvePackImport(imported, installed);
    expect(defaults.map((node) => node.id)).toEqual([
      trimReads.id,
      `${bamStats.id}_2`,
    ]);
    expect(defaults[0].createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(
      resolvePackImport(imported, installed, {
        [trimReads.id]: "skip",
        [bamStats.id]: "replace",
      }).map((node) => node.id),
    ).toEqual([bamStats.id]);
  });

  it("renames a node to keep both", () => {
    const renamed = withNewNodeId(imported[0], new Set([`${trimReads.id}_2`]));
    expect(renamed.id).toBe(`${trimReads.id}_3`);
    expect(renamed.processType).toBe(renamed.id);
  });
});

describe("community index", () => {
  it("lists packs with absolute URLs", () => {
    const { entries, errors } = parseNodePackIndex(
      JSON.stringify({
        format: "n-wave-node-pack-index",
        formatVersion: 1,
        packs: [
          { id: "qc", name: "QC", version: "1.0.0", url: "packs/qc.json" },
          { name: "Broken" },
        ],
      }),
      "https://example.org/index/index.json",
    );
    expect(entries).toEqual([
      {
        id: "qc",
        name: "QC",
        version: "1.0.0",
        url: "https://example.org/index/packs/qc.json",
      },
    ]);
    expect(errors).toEqual([
      'Index entry 2 needs "name", "version" and "url".',
    ]);
    expect(parseNodePackIndex("{}", "https://x").errors[0]).toMatch(
      /isn't an N-WAVE node pack index/,
    );
  });
});

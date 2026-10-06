import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInputDeclarations,
  getInputGroups,
  getMetaInputs,
  getValueInputs,
  parseQualifier,
  stripLineComment,
} from "./nfcoreModuleParser.mjs";

const groupsFor = (inputBlock) =>
  getInputGroups(
    getInputDeclarations(`process X {\n    input:\n${inputBlock}\n\n    output:\n    path "x"\n}`)
  );

describe("parseQualifier", () => {
  it("parses path and val forms", () => {
    assert.deepEqual(parseQualifier("path(reads)"), { kind: "path", name: "reads" });
    assert.deepEqual(parseQualifier("path  index"), { kind: "path", name: "index" });
    assert.deepEqual(parseQualifier("val(meta)"), { kind: "val", name: "meta" });
    assert.deepEqual(parseQualifier("val   sort_bam"), { kind: "val", name: "sort_bam" });
    assert.deepEqual(parseQualifier('path(reads, stageAs: "input*/*")'), {
      kind: "path",
      name: "reads",
      stageAs: "input*/*",
    });
    assert.deepEqual(parseQualifier('path (indexes), stageAs: "dir*"'), {
      kind: "path",
      name: "indexes",
      stageAs: "dir*",
    });
    assert.deepEqual(parseQualifier("path(fastq, arity: '1..2')"), {
      kind: "path",
      name: "fastq",
    });
  });

  it("parses directory staging patterns", () => {
    assert.deepEqual(parseQualifier('path("quants/*")'), {
      kind: "path",
      name: "quants",
      stageAs: "quants/*",
      directory: true,
    });
    assert.deepEqual(parseQualifier("path ('genes/*')"), {
      kind: "path",
      name: "genes",
      stageAs: "genes/*",
      directory: true,
    });
  });

  it("rejects other qualifiers", () => {
    assert.equal(parseQualifier("env(FOO)"), null);
    assert.equal(parseQualifier("stdin"), null);
  });
});

describe("getInputGroups", () => {
  it("parses star/align", () => {
    const groups = groupsFor(`    tuple val(meta), path(reads, stageAs: "input*/*")
    tuple val(meta2), path(index)
    tuple val(meta3), path(gtf)
    val star_ignore_sjdbgtf`);

    assert.equal(groups.length, 4);
    assert.deepEqual(groups[0].items, [
      { kind: "meta", name: "meta" },
      { kind: "path", name: "reads", mode: "each", stageAs: "input*/*" },
    ]);
    assert.deepEqual(groups[1].items[1], { kind: "path", name: "index", mode: "first" });
    assert.equal(groups[2].metaName, "meta3");
    assert.deepEqual(groups[3], {
      argumentIndex: 3,
      handle: "star_ignore_sjdbgtf",
      tuple: false,
      metaName: null,
      fields: [],
      items: [{ kind: "val", name: "star_ignore_sjdbgtf" }],
      unsupported: [],
    });
    assert.ok(groups.every((group) => group.unsupported.length === 0));
  });

  it("parses tuples with several paths and values", () => {
    const [bedtools] = groupsFor("    tuple val(meta), path(intervals), val(scale)");
    assert.deepEqual(bedtools.items.map((item) => item.kind), ["meta", "path", "val"]);

    const [, reference] = groupsFor(`    tuple val(meta), path(reads)
    tuple val(meta2), path(index), path(gtf), path(transcript_fasta)`);
    assert.deepEqual(reference.fields, ["index", "gtf", "transcript_fasta"]);
    assert.ok(reference.items.slice(1).every((item) => item.mode === "first"));
  });

  it("collects directory-staged inputs", () => {
    const groups = groupsFor(`    tuple val(meta), path("quants/*")
    tuple val(meta2), path(tx2gene)
    val quant_type`);
    assert.equal(groups[0].items[1].mode, "collect");
    assert.equal(groups[0].handle, "quants");
  });

  it("keeps a non-meta first value inside a tuple as a value", () => {
    const [, , , other] = groupsFor(`    tuple val(meta), path(reads)
    path  index, name: 'input_index'
    path  primary_ref
    tuple val(other_ref_names), path(other_ref_paths)`);
    assert.equal(other.metaName, null);
    assert.deepEqual(other.items[0], { kind: "val", name: "other_ref_names" });
  });

  it("makes port names unique and ignores trailing comments", () => {
    const groups = groupsFor(`    tuple val(meta), path(reads)  // FASTQ files or BAM file
    path  index
    path  index`);
    assert.deepEqual(
      groups.map((group) => group.handle),
      ["reads", "index", "index_2"]
    );
  });

  it("reports unsupported inputs", () => {
    const [group] = groupsFor("    tuple val(meta), env(FOO)");
    assert.deepEqual(group.unsupported, ["Unsupported tuple token: env(FOO)"]);
  });
});

describe("getMetaInputs / getValueInputs", () => {
  const metaYaml = `name: custom_tx2gene
input:
  - - meta:
        type: map
        description: |
          Groovy Map containing reference information
          e.g. \`[ id:'yeast' ]\`
    - gtf:
        type: file
        description: An annotation file
  - - meta2:
        type: map
    - quants/*:
        type: file
        description: quants file
  - quant_type:
      type: string
      description: Quantification type, 'kallisto', 'salmon', or 'rsem'
  - id:
      type: string
      description: Gene ID attribute in the GTF file (default= gene_id)
  - skip:
      type: boolean
      description: |
        Skip the step
  - length:
      type: integer
      description: Fragment length (default = 200)
output:
  - foo:
      type: file
`;

  it("reads types and descriptions", () => {
    const inputs = getMetaInputs(metaYaml);
    assert.equal(inputs.gtf.type, "file");
    assert.equal(inputs["quants/*"].type, "file");
    assert.equal(inputs.skip.description, "Skip the step");
    assert.equal(
      inputs.meta.description,
      "Groovy Map containing reference information e.g. `[ id:'yeast' ]`"
    );
    assert.equal(inputs.foo, undefined);
  });

  it("builds typed value inputs with documented defaults", () => {
    const groups = groupsFor(`    tuple val(meta), path(gtf)
    val quant_type
    val id
    val skip
    val length
    val(other)`);
    const values = getValueInputs(groups, getMetaInputs(metaYaml));
    assert.deepEqual(
      values.map(({ name, type, defaultValue }) => [name, type, defaultValue]),
      [
        ["quant_type", "string", ""],
        ["id", "string", "gene_id"],
        ["skip", "boolean", false],
        ["length", "integer", 200],
        ["other", "expression", "[]"],
      ]
    );
  });
});

describe("stripLineComment", () => {
  it("keeps // inside strings", () => {
    assert.equal(stripLineComment("path 'a//b' // note"), "path 'a//b'");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorkflowGraph, splitStatements, stripComments } from "./workflowGraph";

const fixture = (name: string) => readFileSync(join(__dirname, "../../test/fixtures/nested", name), "utf8");
const edges = (graph: ReturnType<typeof parseWorkflowGraph>) =>
  graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort();

describe("parseWorkflowGraph", () => {
  it("reads an nf-core subworkflow's steps, its inputs and outputs, and what feeds what", () => {
    const graph = parseWorkflowGraph(fixture("quantify_pseudo_alignment.nf"));
    expect(graph.name).toBe("QUANTIFY_PSEUDO_ALIGNMENT");
    expect(graph.steps).toEqual([
      { id: "SALMON_QUANT", kind: "module", include: "../../../modules/nf-core/salmon/quant", order: 0 },
      { id: "KALLISTO_QUANT", kind: "module", include: "../../../modules/nf-core/kallisto/quant", order: 1 },
      {
        id: "QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT",
        kind: "subworkflow",
        include: "../quant_tximport_summarizedexperiment",
        order: 2,
      },
    ]);
    expect(edges(graph)).toEqual([
      "KALLISTO_QUANT->QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT",
      "KALLISTO_QUANT->output",
      "QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT->output",
      "SALMON_QUANT->QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT",
      "SALMON_QUANT->output",
      "input->KALLISTO_QUANT",
      "input->QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT",
      "input->SALMON_QUANT",
    ]);
    expect(graph.inputs).toHaveLength(11);
    expect(graph.outputs).toContain("tx2gene");
  });

  it("follows channels named with .set { … }", () => {
    expect(edges(parseWorkflowGraph(fixture("bam_stringtie_merge.nf")))).toContain(
      "STRINGTIE_STRINGTIE->STRINGTIE_MERGE",
    );
  });

  it("reads a pipeline's top level and its main workflow", () => {
    const top = parseWorkflowGraph(fixture("rnaseq-main.nf"));
    expect(top.name).toBe("NFCORE_RNASEQ");
    expect(top.steps.map((step) => [step.id, step.kind])).toEqual([
      ["PREPARE_GENOME_REFERENCES", "subworkflow"],
      ["PREPARE_GENOME_INDICES", "subworkflow"],
      ["RNASEQ", "workflow"],
    ]);
    expect(edges(top)).toContain("PREPARE_GENOME_INDICES->RNASEQ");

    const rnaseq = parseWorkflowGraph(fixture("rnaseq-workflow.nf"), "RNASEQ");
    const ids = rnaseq.steps.map((step) => step.id);
    expect(ids).toEqual(expect.arrayContaining(["ALIGN_STAR", "QUANTIFY_PSEUDO_ALIGNMENT", "MULTIQC_RNASEQ"]));
    // Functions and plugins are no steps.
    expect(ids).not.toContain("samplesheetToList");
    expect(edges(rnaseq)).toEqual(
      expect.arrayContaining([
        "FASTQ_QC_TRIM_FILTER_SETSTRANDEDNESS->ALIGN_STAR",
        "ALIGN_STAR->QUANTIFY_RSEM",
        "QUANTIFY_PSEUDO_ALIGNMENT->MULTIQC_RNASEQ",
      ]),
    );
    // Version channels connect everything to everything: left out.
    expect(edges(rnaseq)).not.toContain("KRAKEN2->ALIGN_STAR");
  });

  it("names the step after its alias, and reads bare references (`ch = X`, then `ch.out`)", () => {
    const graph = parseWorkflowGraph(`
      include { SALMON_QUANT as QUANT } from '../../modules/nf-core/salmon/quant'
      include { MERGE } from './merge'
      workflow W {
        take:
        reads
        main:
        if (params.x) {
          QUANT ( reads )
          ch = QUANT
        }
        MERGE ( ch.out.results.collect() )
        emit:
        merged = MERGE.out.merged
        versions = QUANT.out.versions
      }`);
    expect(graph.steps.map((step) => `${step.id}:${step.kind}`)).toEqual(["QUANT:module", "MERGE:subworkflow"]);
    expect(edges(graph)).toEqual(["MERGE->output", "QUANT->MERGE", "input->QUANT"]);
    expect(graph.outputs).toEqual(["merged"]);
  });

  it("tells processes from subworkflows by where they come from", () => {
    const graph = parseWorkflowGraph(`
      include { STAR_ALIGN } from '../../../modules/nf-core/star/align/main'
      include { DESEQ2_QC } from '../../modules/local/deseq2_qc'
      include { BAM_SORT_STATS_SAMTOOLS } from '../../nf-core/bam_sort_stats_samtools'
      include { RNASEQ } from './workflows/rnaseq'
      workflow W { STAR_ALIGN(x); DESEQ2_QC(x); BAM_SORT_STATS_SAMTOOLS(x); RNASEQ(x) }`);
    expect(graph.steps.map((step) => `${step.id}:${step.kind}`)).toEqual([
      "STAR_ALIGN:module",
      "DESEQ2_QC:module",
      "BAM_SORT_STATS_SAMTOOLS:subworkflow",
      "RNASEQ:workflow",
    ]);
  });

  it("has no steps for a file without a workflow", () => {
    expect(parseWorkflowGraph("process X { script: 'echo' }")).toMatchObject({ steps: [], edges: [] });
  });
});

describe("Nextflow text helpers", () => {
  it("drops comments but keeps strings", () => {
    expect(stripComments("a // note\nb /* x\ny */ 'http://x' ")).toBe("a \nb \n 'http://x' ");
  });

  it("splits statements, keeping chained calls and closures together", () => {
    expect(
      splitStatements(`
        A ( x )
        ch = A.out.y
            .map { it ->
              it }
        if (p) {
          B ( ch )
        } else { C ( ch ) }
      `),
    ).toEqual(["A ( x )", "ch = A.out.y\n            .map { it ->\n              it }", "B ( ch )", "C ( ch )"]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { registerDynamicNodeDefinitions } from "../../registry/nodeDefinitions";
import catalog from "../../registry/nfcore/catalog.json";
import { copySubworkflow } from "./copySubworkflow";
import type { NfCoreCatalogForImport } from "./importScript";

const CATALOG = catalog as unknown as NfCoreCatalogForImport;
const fixture = (file: string) => readFileSync(join(__dirname, "../../test/fixtures", file), "utf8");
const copy = (name: string, file: string) => {
  const entry = CATALOG.subworkflows?.find((candidate) => candidate.id === `nf-core/subworkflows/${name}`);
  if (!entry) throw new Error(name);
  const copied = copySubworkflow(fixture(file), entry, CATALOG);
  registerDynamicNodeDefinitions(copied.definitions);
  return { ...copied, script: generateNextflowScript(copied.nodes, copied.edges, copied.name, "results") };
};
const byLabel = (nodes: Node<NodeData>[], label: string) => nodes.find((node) => node.data.label === label);
const into = (copied: ReturnType<typeof copy>, label: string) =>
  copied.edges
    .filter((edge) => edge.target === byLabel(copied.nodes, label)?.id)
    .map((edge) => `${copied.nodes.find((node) => node.id === edge.source)?.data.label}.${edge.sourceHandle} -> ${edge.targetHandle}`)
    .sort();

describe("copying an nf-core subworkflow into a workflow", () => {
  it("makes its steps nodes, connected as it connects them", () => {
    // Read first: the importer reads the module's inputs from the catalog,
    // not from definitions registered by an earlier import.
    const hisat2 = copy("fastq_align_hisat2", "nested/fastq_align_hisat2.nf");
    expect(hisat2.name).toBe("FASTQ_ALIGN_HISAT2 (copy)");
    expect(hisat2.nodes.map((node) => `${node.type}:${node.data.label}`).sort()).toEqual(
      [
        "channelOperator:Fasta fai",
        "process:HISAT2_ALIGN",
        "process:BAM_SORT_STATS_SAMTOOLS",
        "samplesheet:Reads",
        "parameters:Parameters",
        ...["Orig bam", "Summary", "Fastq", "Bam", "Index", "Stats", "Flagstat", "Idxstats"].map((label) => `outputDisplay:${label} output`),
      ].sort(),
    );
    expect(into(hisat2, "HISAT2_ALIGN")).toEqual(["Parameters.index -> index", "Parameters.splicesites -> splicesites", "Reads.samples -> reads"]);
    // A take with two files: a subworkflow reads them as one tuple, built from the files.
    expect(into(hisat2, "BAM_SORT_STATS_SAMTOOLS")).toEqual(["Fasta fai.ch_fasta_fai -> ch_fasta_fai", "HISAT2_ALIGN.bam -> ch_bam"]);
    expect(into(hisat2, "Fasta fai")).toEqual(["Parameters.fai -> fai", "Parameters.fasta -> fasta"]);
    expect(byLabel(hisat2.nodes, "Fasta fai")?.data.channelOperatorCode).toBe(
      "output.ch_fasta_fai = input.fasta.combine(input.fai)\n    .map { fasta, fai -> [ [id: fasta.baseName], fasta, fai ] }",
    );
    expect(into(hisat2, "Summary output")).toEqual(["HISAT2_ALIGN.summary -> in"]);
    // A value take is a parameter the step reads.
    expect(byLabel(hisat2.nodes, "HISAT2_ALIGN")?.data.nfcoreValues).toEqual({ save_unaligned: "params.save_unaligned" });
    expect(hisat2.script).toContain("params.save_unaligned = false");
    expect(hisat2.script).toMatch(/HISAT2_ALIGN\(.*params\.save_unaligned\)/);
    expect(hisat2.warnings).toEqual([expect.stringMatching(/modules\.config \(ext\.args, ext\.prefix\)/)]);
  });

  it("keeps channel code between steps as channel operators", () => {
    const sort = copy("bam_sort_stats_samtools", "nfcore-bam_sort_stats_samtools.main.nf");
    expect(byLabel(sort.nodes, "Bam")?.type).toBe("fileInput");
    expect(byLabel(sort.nodes, "Bam output")?.type).toBe("outputDisplay");
    const join = sort.nodes.find((node) => String(node.data.channelOperatorCode ?? "").includes(".join("));
    expect(join?.data.channelOperatorCode).toContain(".join(");
    expect(into(sort, "BAM_STATS_SAMTOOLS")).toEqual(["Fasta fai.ch_fasta_fai -> ch_fasta_fai", `${join?.data.label}.ch_bam_bai -> ch_bam_bai`]);
    // A module's tuple input takes the files port by port.
    expect(into(sort, "SAMTOOLS_SORT")).toEqual(["Bam.ch_files_out -> bam", "Parameters.fai -> fai", "Parameters.fasta -> fasta"]);
    expect(into(sort, "Stats output")).toEqual(["BAM_STATS_SAMTOOLS.stats -> in"]);
  });

  it("keeps code it has no steps for (an if on a value take) with its includes", () => {
    const quantify = copy("quantify_pseudo_alignment", "nested/quantify_pseudo_alignment.nf");
    expect(quantify.script).toContain("include { SALMON_QUANT } from './modules/nf-core/salmon/quant/main'");
    expect(quantify.script).toContain("include { KALLISTO_QUANT } from './modules/nf-core/kallisto/quant/main'");
    expect(quantify.script).toContain("if (params.pseudo_aligner == 'salmon') {");
    // What the if assigns is read by the step after it, and by the outputs.
    const branches = quantify.nodes.find((node) => String(node.data.channelOperatorCode ?? "").includes("SALMON_QUANT"));
    expect(into(quantify, "QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT")).toContain("ch_pseudo_results.ch_pseudo_results -> quant_results");
    expect(branches?.data.label).toBe("ch_pseudo_results");
    expect(into(quantify, "Results output")).toEqual([`${branches?.data.label}.ch_pseudo_results -> in`]);
    expect(quantify.warnings.length).toBe(1);
  });
});

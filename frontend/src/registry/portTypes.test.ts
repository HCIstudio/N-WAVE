import type { Edge, Node } from "@xyflow/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import star from "../demo/rnaseqStarSalmonExample.json";
import { registerNfCoreNodes } from "../../scripts/lint/fixtures";
import { checkPortFit, connectionHints, sourceContents, targetContents } from "./portTypes";

// Demo 3, the nf-core/rnaseq route rebuilt from library nodes.
const nodes = (star as unknown as { nodes: Node<NodeData>[] }).nodes;
const edges = (star as unknown as { edges: Edge[] }).edges;
const node = (id: string): Node<NodeData> => {
  const found = nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};
const portFit = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
  checkPortFit(node(source), sourceHandle, node(target), targetHandle);

beforeAll(() => registerNfCoreNodes(nodes));

describe("port contents", () => {
  it("come from module patterns, uploads, parameters and samplesheets", () => {
    expect(sourceContents(node("star_align"), "bam")).toEqual({ kind: "file", patterns: ["*.{bam}"] });
    expect(sourceContents(node("star_index"), "index")).toEqual({ kind: "directory", patterns: [] });
    expect(sourceContents(node("star_index"), "versions_star")?.kind).toBe("version");
    expect(sourceContents(node("reference"), "fasta")).toEqual({
      kind: "file",
      patterns: [],
      fileNames: ["genome.fasta"],
    });
    expect(sourceContents(node("samples"), "samples")?.patterns).toEqual(["*.{fastq,fq}{,.gz}"]);
  });

  it("fall back to common input names without a pattern", () => {
    expect(targetContents(node("star_index"), "fasta")?.patterns[0]).toContain("fasta");
    // "reads" may be FASTQ, FASTA or BAM, depending on the tool: anything goes.
    expect(targetContents(node("fastqc_raw"), "reads")).toBeNull();
  });
});

describe("checkPortFit", () => {
  it("finds every connection of the rnaseq example fits", () => {
    expect(connectionHints(nodes, edges)).toEqual({});
  });

  it("warns about reads where a genome is expected, and says what to connect", () => {
    const hint = portFit("samples", "samples", "star_index", "fasta");
    expect(hint?.message).toBe(
      "“STAR index” expects FASTA sequences (*.{fa,fasta,fna,fas,faa}{,.gz}) on “fasta”, but “Samplesheet” gives FASTQ reads (*.{fastq,fq}{,.gz}).",
    );
    expect(hint?.fix).toMatch(/reference from a Parameters node/);
  });

  it("warns about alignments where transcripts are expected", () => {
    expect(portFit("star_align", "bam", "salmon_index", "transcript_fasta")?.message).toContain(
      "gives alignments (BAM/CRAM/SAM) (*.{bam})",
    );
  });

  it("names uploaded files that don't fit", () => {
    expect(portFit("reference", "gtf", "star_index", "fasta")?.message).toContain("gives annotation (GTF/GFF) (“genes.gtf.gz”)");
  });

  it("tells folders and files apart", () => {
    expect(portFit("star_index", "index", "star_align", "gtf")?.message).toContain("gives a folder (such as an index)");
    expect(portFit("gtf_filter", "gtf", "star_align", "index")?.fix).toMatch(/index output of the step that builds it/);
  });

  it("points version outputs to MultiQC", () => {
    expect(portFit("star_index", "versions_star", "gtf_filter", "gtf")?.fix).toMatch(/MultiQC's software versions/);
  });

  it("accepts compressed and uncompressed files alike, and vague patterns", () => {
    const gz = { ...node("reference"), data: { ...node("reference").data, parameters: [{ name: "fasta", type: "file", value: "https://x.org/genome.fa.gz" }] } };
    expect(checkPortFit(gz as Node<NodeData>, "fasta", node("gtf_filter"), "fasta")).toBeNull();
    // gunzip takes "*.*": anything.
    expect(portFit("samples", "samples", "gunzip_gtf", "archive")).toBeNull();
  });

  it("says nothing when either side's contents are unknown", () => {
    expect(portFit("trim_galore", "reads", "fastqc_raw", "reads")).toBeNull();
    expect(portFit("qc_reports", "reports", "multiqc", "multiqc_files")).toBeNull();
  });
});

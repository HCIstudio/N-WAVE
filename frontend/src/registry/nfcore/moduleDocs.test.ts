import { describe, expect, it } from "vitest";
import { nfCoreDocsUrl, parseNfCoreMeta } from "./moduleDocs";

// Trimmed from nf-core/modules star/align and salmon/quant meta.yml.
const MODULE_META = `
name: star_align
description: Align reads to a reference genome using STAR
tools:
  - star:
      description: |
        STAR is a software package for mapping DNA sequences against
        a large reference genome.
      homepage: https://github.com/alexdobin/STAR
      manual: https://github.com/alexdobin/STAR/blob/master/doc/STARmanual.pdf
input:
  - - meta:
        type: map
        description: Groovy Map containing sample information
    - reads:
        type: file
        description: |
          List of input FastQ files of size 1 and 2 for single-end and
          paired-end data, respectively.
  - - meta2:
        type: map
        description: Groovy Map containing reference information
    - index:
        type: directory
        description: Folder containing the salmon index files.
    - gtf:
        type: file
        description: GTF of the reference transcriptome
  - star_ignore_sjdbgtf:
      type: boolean
      description: Ignore annotation GTF file
output:
  log_final:
    - - meta:
          type: map
          description: Groovy Map containing sample information
      - "*Log.final.out":
          type: file
          description: STAR final log file
          pattern: "*Log.final.out"
  versions_star:
    - - \${task.process}:
          type: string
          description: The name of the process
      - star:
          type: string
          description: The name of the tool
      - STAR --version | sed "s/STAR_//":
          type: eval
          description: The expression to obtain the version of the tool
  bam_sorted:
    - - meta:
          type: map
          description: Groovy Map containing sample information
      - \${prefix}.sortedByCoord.out.bam:
          type: file
          description: Sorted BAM file of read alignments (optional)
          pattern: "*sortedByCoord.out.bam"
`;

// Trimmed from subworkflows/nf-core/bam_sort_stats_samtools/meta.yml.
const SUBWORKFLOW_META = `
name: bam_sort_stats_samtools
description: Sort SAM/BAM/CRAM file
input:
  - ch_bam:
      type: file
      description: |
        BAM/CRAM/SAM file.

        Structure: [ val(meta), path(bam) ]
      pattern: "*.{bam,cram,sam}"
output:
  - bam:
      type: file
      description: Sorted BAM/CRAM/SAM file.
  - meta:
      type: map
      description: Groovy Map containing sample information
`;

describe("parseNfCoreMeta", () => {
  it("reads a module's description, tools, inputs and outputs", () => {
    const docs = parseNfCoreMeta(MODULE_META);
    expect(docs?.description).toBe(
      "Align reads to a reference genome using STAR",
    );
    expect(docs?.tools).toEqual([
      {
        name: "star",
        description:
          "STAR is a software package for mapping DNA sequences against a large reference genome.",
        homepage: "https://github.com/alexdobin/STAR",
      },
    ]);
    expect(docs?.inputs).toEqual([
      {
        name: "reads",
        type: "file",
        description:
          "List of input FastQ files of size 1 and 2 for single-end and paired-end data, respectively.",
      },
      {
        name: "index",
        type: "directory",
        description: "Folder containing the salmon index files.",
        parts: [
          {
            name: "index",
            description: "Folder containing the salmon index files.",
          },
          { name: "gtf", description: "GTF of the reference transcriptome" },
        ],
      },
      {
        name: "gtf",
        type: "file",
        description: "GTF of the reference transcriptome",
      },
      {
        name: "star_ignore_sjdbgtf",
        type: "boolean",
        description: "Ignore annotation GTF file",
      },
    ]);
    expect(docs?.outputs.map((output) => output.name)).toEqual([
      "log_final",
      "versions_star",
      "bam_sorted",
    ]);
    expect(docs?.outputs[0]).toEqual({
      name: "log_final",
      type: "file",
      description: "STAR final log file",
      pattern: "*Log.final.out",
    });
    expect(docs?.outputs[1]?.type).toBe("version");
    expect(docs?.outputs[2]?.description).toBe(
      "Sorted BAM file of read alignments (optional)",
    );
  });

  it("reads a subworkflow's listed inputs and outputs", () => {
    const docs = parseNfCoreMeta(SUBWORKFLOW_META);
    expect(docs?.inputs).toEqual([
      {
        name: "ch_bam",
        type: "file",
        description: "BAM/CRAM/SAM file. Structure: [ val(meta), path(bam) ]",
        pattern: "*.{bam,cram,sam}",
      },
    ]);
    // The meta map isn't a port of its own.
    expect(docs?.outputs.map((output) => output.name)).toEqual(["bam"]);
  });

  it("returns null for text that isn't a meta.yml", () => {
    expect(parseNfCoreMeta("a: [unclosed")).toBeNull();
    expect(parseNfCoreMeta("just text")).toBeNull();
  });
});

describe("nfCoreDocsUrl", () => {
  it("links modules and subworkflows to nf-co.re", () => {
    expect(nfCoreDocsUrl("nf-core/star/align")).toBe(
      "https://nf-co.re/modules/star_align",
    );
    expect(nfCoreDocsUrl("nf-core/fastqc")).toBe(
      "https://nf-co.re/modules/fastqc",
    );
    expect(
      nfCoreDocsUrl("nf-core/subworkflows/bam_sort_stats_samtools"),
    ).toBe("https://nf-co.re/subworkflows/bam_sort_stats_samtools");
  });
});

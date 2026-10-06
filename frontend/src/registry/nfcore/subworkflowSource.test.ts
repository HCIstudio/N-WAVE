import { describe, expect, it } from "vitest";
import {
  emptyChannelFor,
  extractRootIncludes,
  getSubworkflowIncludes,
  parseWorkflowSignature,
} from "./subworkflowSource";

const source = `//
// Sort, index BAM file and run samtools stats, flagstat and idxstats
//

include { SAMTOOLS_SORT      } from '../../../modules/nf-core/samtools/sort/main'
include { SAMTOOLS_INDEX     } from '../../../modules/nf-core/samtools/index'
include { BAM_STATS_SAMTOOLS } from '../bam_stats_samtools/main'
include { LOCAL              } from '../../local/thing'

workflow BAM_SORT_STATS_SAMTOOLS {
    take:
    ch_bam       // channel: [ val(meta), [ bam ] ]
    ch_fasta     // channel: [ val(meta), path(fasta) ]
    skip_index   // bool: skip indexing

    main:
    SAMTOOLS_SORT ( ch_bam, ch_fasta, '' )

    emit:
    bam      = SAMTOOLS_SORT.out.bam           // channel: [ val(meta), [ bam ] ]
    stats    = BAM_STATS_SAMTOOLS.out.stats    // channel: [ val(meta), [ stats ] ]
}
`;

describe("subworkflow sources", () => {
  it("lists the nf-core modules and subworkflows included", () => {
    expect(getSubworkflowIncludes(source)).toEqual({
      modules: ["samtools/index", "samtools/sort"],
      subworkflows: ["bam_stats_samtools"],
    });
  });

  it("moves includes to the project root, leaving unknown ones", () => {
    const { includes, source: rest } = extractRootIncludes(source);
    expect(includes).toEqual([
      "include { SAMTOOLS_SORT } from './modules/nf-core/samtools/sort/main'",
      "include { SAMTOOLS_INDEX } from './modules/nf-core/samtools/index/main'",
      "include { BAM_STATS_SAMTOOLS } from './subworkflows/nf-core/bam_stats_samtools/main'",
    ]);
    expect(rest).toContain(
      "include { LOCAL              } from '../../local/thing'",
    );
    expect(rest).not.toContain("modules/nf-core");
    expect(rest).toContain("workflow BAM_SORT_STATS_SAMTOOLS {");
  });

  it("reads the workflow's takes and emits", () => {
    expect(parseWorkflowSignature(source)).toEqual({
      name: "BAM_SORT_STATS_SAMTOOLS",
      takes: [
        { name: "ch_bam", comment: "channel: [ val(meta), [ bam ] ]" },
        { name: "ch_fasta", comment: "channel: [ val(meta), path(fasta) ]" },
        { name: "skip_index", comment: "bool: skip indexing" },
      ],
      emits: ["bam", "stats"],
    });
    expect(parseWorkflowSignature("process X {}").name).toBe("");
  });

  it("shapes placeholders for unconnected channels", () => {
    expect(emptyChannelFor("channel: [ val(meta), [ bam ] ]")).toBe(
      "Channel.value([[:], []])",
    );
    expect(emptyChannelFor("channel: /path/to/genome.gtf")).toBe(
      "Channel.value([])",
    );
  });
});

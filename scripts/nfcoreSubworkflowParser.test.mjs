import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMetaInputs } from "./nfcoreModuleParser.mjs";
import {
  emptyChannelFor,
  getEmits,
  getIncludes,
  getTakes,
  getWorkflowSections,
} from "./nfcoreSubworkflowParser.mjs";

const mainNf = `//
// Pseudoalignment and quantification with Salmon
//

include { SALMON_QUANT     } from '../../../modules/nf-core/salmon/quant'
include { CUSTOM_TX2GENE   } from '../../../modules/nf-core/custom/tx2gene/main'
include { QUANT_TXIMPORT   } from '../quant_tximport_summarizedexperiment'
include { BAM_STATS        } from '../../nf-core/bam_stats_samtools/main'
include { paramsSummaryMap } from 'plugin/nf-schema'
include { LOCAL_THING      } from '../../local/thing'

workflow QUANTIFY_PSEUDO_ALIGNMENT {
    take:
    reads                     // channel: [ val(meta), [ reads ] ]
    index                     // channel: [ val(meta2), /path/to/index/ ]
    gtf                       // channel: /path/to/genome.gtf
    gtf_id_attribute          //     val: GTF gene ID attribute
    skip_merge                //    bool: skip cross-sample merging
    lib_type

    main:
    SALMON_QUANT ( reads, index )

    emit:
    results  = SALMON_QUANT.out.results // channel: [ val(meta), results_dir ]
    versions                            // channel: [ versions.yml ]
    merged   = QUANT_TXIMPORT.out.merged
        .map { it }
}

def helper() {
    emit:
    nope = 1
}
`;

const metaYaml = `name: "quantify_pseudo_alignment"
input:
  - reads:
      type: file
      description: Channel with input FastQ files
  - gtf_id_attribute:
      type: string
      description: |
        Attribute in GTF file corresponding to the gene identifier
        (default= gene_id).
  - skip_merge:
      type: boolean
      description: Skip cross-sample merging.
  - lib_type:
      type: string
      description: Library type.
output:
  - results:
      type: file
`;

describe("getWorkflowSections", () => {
  it("reads the workflow name, takes and emits with their comments", () => {
    const sections = getWorkflowSections(mainNf);
    assert.equal(sections.name, "QUANTIFY_PSEUDO_ALIGNMENT");
    assert.deepEqual(
      sections.take.map((line) => line.code),
      ["reads", "index", "gtf", "gtf_id_attribute", "skip_merge", "lib_type"]
    );
    assert.equal(sections.take[0].comment, "channel: [ val(meta), [ reads ] ]");
    // Stops at the end of the workflow: the helper's emit isn't included.
    assert.deepEqual(
      getEmits(sections).map((emit) => emit.name),
      ["results", "versions", "merged"]
    );
  });

  it("returns no name without a workflow", () => {
    assert.equal(getWorkflowSections("process X {}").name, "");
  });
});

describe("getTakes", () => {
  it("types takes from their comments and meta.yml", () => {
    const takes = getTakes(
      getWorkflowSections(mainNf),
      getMetaInputs(metaYaml)
    );
    assert.deepEqual(
      takes.map(({ name, kind, type, defaultValue }) => ({
        name,
        kind,
        type,
        defaultValue,
      })),
      [
        {
          name: "reads",
          kind: "channel",
          type: "expression",
          defaultValue: "Channel.value([[:], []])",
        },
        {
          name: "index",
          kind: "channel",
          type: "expression",
          defaultValue: "Channel.value([[:], []])",
        },
        {
          name: "gtf",
          kind: "channel",
          type: "expression",
          defaultValue: "Channel.value([])",
        },
        {
          name: "gtf_id_attribute",
          kind: "value",
          type: "string",
          defaultValue: "gene_id",
        },
        {
          name: "skip_merge",
          kind: "value",
          type: "boolean",
          defaultValue: false,
        },
        // No comment: meta.yml's type decides.
        { name: "lib_type", kind: "value", type: "string", defaultValue: "" },
      ]
    );
    assert.equal(takes[0].description, "Channel with input FastQ files");
    assert.equal(takes[2].description, "channel: /path/to/genome.gtf");
  });
});

describe("emptyChannelFor", () => {
  it("shapes the placeholder after the take's comment", () => {
    assert.equal(
      emptyChannelFor("channel: [ val(meta), path(bam), path(bai) ]"),
      "Channel.value([[:], [], []])"
    );
    assert.equal(
      emptyChannelFor("channel: [ val(meta2), [ fasta, fai ] ]"),
      "Channel.value([[:], []])"
    );
    assert.equal(emptyChannelFor(""), "Channel.value([])");
  });
});

describe("getIncludes", () => {
  it("sorts includes into modules, subworkflows, plugins and other files", () => {
    assert.deepEqual(getIncludes(mainNf), {
      modules: ["custom/tx2gene", "salmon/quant"],
      subworkflows: ["bam_stats_samtools", "quant_tximport_summarizedexperiment"],
      plugins: ["plugin/nf-schema"],
      other: ["../../local/thing"],
    });
  });
});

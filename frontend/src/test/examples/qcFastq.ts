// Builds the "QC of FASTQ files" template: a samplesheet of reads, FastQC on
// each sample and one MultiQC report, from the pinned nf-core catalog the way
// the node menu creates the nodes. Only tests import this; the stored copy is
// frontend/src/templates/qcFastqTemplate.json, kept in sync by qcFastq.test.ts.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../../components/nodes/BaseNode";
import { edge, fromDefinition, moduleDefinition, note, TEST_DATA } from "./rnaseqStarSalmon";

/** The nf-core components the template's nodes come from. */
export const QC_FASTQ_COMPONENTS = ["nf-core/fastqc", "nf-core/multiqc"];

/** Two paired-end samples from the nf-core/rnaseq test data. */
const SAMPLESHEET = [
  "sample,fastq_1,fastq_2",
  `WT_REP1,${TEST_DATA}/SRR6357070_1.fastq.gz,${TEST_DATA}/SRR6357070_2.fastq.gz`,
  `WT_REP2,${TEST_DATA}/SRR6357072_1.fastq.gz,${TEST_DATA}/SRR6357072_2.fastq.gz`,
  "",
].join("\n");

export const buildQcFastqTemplate = () => {
  const [fastqc, multiqc] = QC_FASTQ_COMPONENTS.map(moduleDefinition);
  const nodes = [
    {
      id: "samples",
      type: "samplesheet",
      position: { x: 0, y: 120 },
      data: {
        label: "Samplesheet",
        icon: "Sheet",
        subtitle: "2 samples, paired-end",
        samplesheet: SAMPLESHEET,
        samplesheetFileName: "samplesheet.csv",
        samplesheetMapping: {
          idColumn: "sample",
          read1Column: "fastq_1",
          read2Column: "fastq_2",
        },
        outputs: [{ name: "samples", label: "Samples", isConnectable: true }],
      },
    },
    fromDefinition("fastqc", fastqc, { x: 380, y: 80 }, { label: "FastQC" }),
    fromDefinition("multiqc", multiqc, { x: 760, y: 80 }, { label: "MultiQC" }),
    note(
      "note_start",
      { x: 0, y: -220 },
      "QC of FASTQ files",
      [
        "FastQC checks the quality of each sample's reads; MultiQC collects the reports into one page.",
        "",
        "The samplesheet lists two samples of the nf-core test data, downloaded on the fly. Replace them with your own: upload a samplesheet in its panel, with one row per sample and the paths or URLs of its FASTQ files.",
      ].join("\n"),
    ),
    note(
      "note_results",
      { x: 760, y: -220 },
      "Results",
      [
        "Each node saves its outputs to results/<node name>: the FastQC reports in results/fastqc, the summary in results/multiqc/multiqc_report.html.",
      ].join("\n"),
    ),
  ] as Node<NodeData>[];

  const edges: Edge[] = [
    edge("samples", "samples", "fastqc", "reads"),
    edge("fastqc", "zip", "multiqc", "multiqc_files"),
  ];
  return { nodes, edges, definitions: [fastqc, multiqc] };
};

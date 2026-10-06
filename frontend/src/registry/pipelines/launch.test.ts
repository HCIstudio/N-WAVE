import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { keyReports } from "../../components/panels/process/PipelineResults";
import { buildPipelineProjectFiles } from "../../export/exportProject";
import {
  buildPipelineLaunch,
  getPipelineLaunchIssues,
  pipelineLaunchScript,
  pipelineParamsFile,
  samplesheetForPipeline,
} from "./launch";

const node = (
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

const pipeline = (data: Record<string, unknown> = {}) =>
  node("rnaseq", "pipeline", {
    pipelineName: "rnaseq",
    pipelineVersion: "3.27.0",
    pipelineValues: {},
    ...data,
  });

const sheet = node("sheet", "samplesheet", {
  samplesheet:
    "id,r1,r2,strandedness\nWT,wt_1.fq.gz,wt_2.fq.gz,auto\nKO,https://example.org/ko_1.fq.gz,,reverse\n",
  samplesheetFileName: "sheet.csv",
  samplesheetMapping: { idColumn: "id", read1Column: "r1", read2Column: "r2" },
});
const refs = node("refs", "parameters", {
  parameters: [
    { name: "genome_fasta", type: "file", value: "genome.fa" },
    { name: "annotation", type: "file", value: "/data/genes.gtf" },
  ],
});
const reads = node("reads", "fileInput", {
  files: [{ name: "wt_1.fq.gz" }, { name: "wt_2.fq.gz" }],
});

const edge = (
  source: string,
  sourceHandle: string,
  targetHandle: string,
): Edge => ({
  id: `${source}-${targetHandle}`,
  source,
  sourceHandle,
  target: "rnaseq",
  targetHandle,
});

describe("launching an nf-core pipeline", () => {
  it("builds the command, params and inputs from the canvas", () => {
    const launch = buildPipelineLaunch(
      [
        reads,
        sheet,
        refs,
        pipeline({
          pipelineValues: {
            aligner: "hisat2",
            skip_trimming: true,
            outdir: "x",
            gtf: "",
          },
        }),
      ],
      [
        edge("sheet", "samples", "input"),
        edge("refs", "genome_fasta", "fasta"),
        edge("refs", "annotation", "gtf"),
      ],
    );
    expect(launch?.command).toBe(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile docker -params-file params.json --outdir results",
    );
    expect(launch?.params).toEqual({
      aligner: "hisat2",
      skip_trimming: true,
      input: "inputs/sheet.csv",
      fasta: "inputs/genome.fa",
      gtf: "/data/genes.gtf",
    });
    expect(launch && JSON.parse(pipelineParamsFile(launch))).toEqual(
      launch?.params,
    );
    expect(launch?.inputFiles.map((file) => file.name).sort()).toEqual([
      "sheet.csv",
      "wt_1.fq.gz",
      "wt_2.fq.gz",
    ]);
    expect(
      launch?.inputFiles.find((file) => file.name === "sheet.csv")?.content,
    ).toBe(
      "sample,fastq_1,fastq_2,strandedness\nWT,inputs/wt_1.fq.gz,inputs/wt_2.fq.gz,auto\nKO,https://example.org/ko_1.fq.gz,,reverse\n",
    );
  });

  it("runs the pipeline's test profile without inputs", () => {
    const launch = buildPipelineLaunch(
      [pipeline({ pipelineTestProfile: true })],
      [],
    );
    expect(launch?.command).toBe(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker --outdir results",
    );
    expect(launch?.params).toEqual({});
  });

  it("is null without a Pipeline node", () => {
    expect(buildPipelineLaunch([sheet], [])).toBeNull();
  });

  it("explains what stops a launch", () => {
    expect(getPipelineLaunchIssues([pipeline()], [])).toEqual([
      "Connect a samplesheet to the pipeline's input, or use the pipeline's test profile.",
    ]);
    expect(
      getPipelineLaunchIssues(
        [
          pipeline({ pipelineName: "", pipelineTestProfile: true }),
          node("p2", "pipeline", {}),
          node("qc", "process", {}),
        ],
        [],
      ),
    ).toEqual([
      "A workflow can run one pipeline; remove the extra Pipeline nodes.",
      "A workflow with a Pipeline node runs that pipeline only; it can hold input nodes (File Input, Samplesheet, Parameters) and notes, but no other steps.",
      "Choose a pipeline.",
    ]);
    expect(() => buildPipelineLaunch([pipeline()], [])).toThrow(
      "Connect a samplesheet",
    );
  });

  it("quotes samplesheet fields that need it", () => {
    expect(
      samplesheetForPipeline(
        node("s", "samplesheet", {
          samplesheet: 'sample,fastq_1,fastq_2,note\nA,a.fq,,"x, y"\n',
        }),
      ),
    ).toBe('sample,fastq_1,fastq_2,note\nA,inputs/a.fq,,"x, y"\n');
  });
});

describe("exporting a pipeline launch", () => {
  const launch = buildPipelineLaunch(
    [sheet, reads, pipeline({ pipelineValues: { pseudo_aligner: "salmon" } })],
    [edge("sheet", "samples", "input")],
  );
  if (!launch) throw new Error("no launch");

  it("writes the params file, inputs, run script and README", () => {
    const files = buildPipelineProjectFiles({
      workflowName: "RNA run",
      launch,
    });
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "inputs/sheet.csv",
      "params.json",
      "run.sh",
    ]);
    expect(JSON.parse(files["params.json"])).toEqual({
      pseudo_aligner: "salmon",
      input: "inputs/sheet.csv",
    });
    expect(files["run.sh"]).toContain(`${launch.command} "$@"`);
    expect(files["README.md"]).toContain("cd RNA_run");
    expect(files["README.md"]).toContain(
      "`inputs/wt_1.fq.gz`: **not included**, add this file before running",
    );
  });

  it("writes a standalone launch script", () => {
    expect(pipelineLaunchScript(launch)).toBe(
      [
        "#!/usr/bin/env bash",
        "# nf-core/rnaseq 3.27.0, generated by N-WAVE.",
        "# Inputs expected in ./inputs: sheet.csv, wt_1.fq.gz, wt_2.fq.gz",
        "set -euo pipefail",
        "cat > params.json <<'NWAVE_PARAMS'",
        "{",
        '  "pseudo_aligner": "salmon",',
        '  "input": "inputs/sheet.csv"',
        "}",
        "NWAVE_PARAMS",
        `${launch.command} "$@"`,
        "",
      ].join("\n"),
    );
  });

  it("picks the MultiQC and run reports from the results", () => {
    expect(
      keyReports([
        { path: "multiqc/star_salmon/multiqc_report.html", size: 1 },
        { path: "multiqc/star_salmon/multiqc_data/x.txt", size: 1 },
        { path: "pipeline_info/execution_report_2026-10-06.html", size: 1 },
        { path: "pipeline_info/params_2026.json", size: 1 },
      ]).map((file) => file.path),
    ).toEqual([
      "multiqc/star_salmon/multiqc_report.html",
      "pipeline_info/execution_report_2026-10-06.html",
    ]);
  });
});

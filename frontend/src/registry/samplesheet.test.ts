import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { summarizeSamplesheet } from "../components/panels/input/SamplesheetPanel";
import { generateNextflowScript } from "../generators";
import { getWorkflowInputFiles } from "../utils/inputFiles";
import { nodeDefinitions } from "./nodeDefinitions";
import {
  DEFAULT_SAMPLESHEET_MAPPING,
  generateSamplesheetChannel,
  parseCsv,
  parseSamplesheet,
} from "./samplesheet";

const uploaded = ["a_R1.fastq.gz", "a_R2.fastq.gz", "b.fastq.gz"];

describe("parseCsv", () => {
  it("handles quotes, embedded commas, CRLF and blank lines", () => {
    expect(
      parseCsv('sample,note\r\n"s1","a, ""quoted"" note"\r\n\r\ns2,x\n'),
    ).toEqual([
      { line: 1, fields: ["sample", "note"] },
      { line: 2, fields: ["s1", 'a, "quoted" note'] },
      { line: 4, fields: ["s2", "x"] },
    ]);
  });
});

describe("parseSamplesheet", () => {
  it("parses paired- and single-end rows with extra columns as meta", () => {
    const parsed = parseSamplesheet(
      [
        "sample,fastq_1,fastq_2,strandedness",
        "a,a_R1.fastq.gz,a_R2.fastq.gz,reverse",
        "b,b.fastq.gz,,auto",
        "c,https://example.org/c.fastq.gz,,auto",
        "d,/data/d.fastq.gz,,auto",
      ].join("\n"),
      DEFAULT_SAMPLESHEET_MAPPING,
      uploaded,
    );

    expect(parsed.columns).toEqual([
      "sample",
      "fastq_1",
      "fastq_2",
      "strandedness",
    ]);
    expect(parsed.rows[0]).toEqual({
      line: 2,
      id: "a",
      reads: ["a_R1.fastq.gz", "a_R2.fastq.gz"],
      singleEnd: false,
      meta: { strandedness: "reverse" },
    });
    expect(parsed.rows.map((row) => row.singleEnd)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    // Absolute paths and URLs don't have to be uploaded.
    expect(parsed.issues).toEqual([
      {
        level: "warning",
        message: "The samplesheet mixes single-end and paired-end samples.",
      },
    ]);
    expect(summarizeSamplesheet(parsed)).toBe("4 samples, 1 paired-end");
  });

  it("reports missing columns", () => {
    const parsed = parseSamplesheet(
      "id,reads\ns1,x.fastq.gz\n",
      DEFAULT_SAMPLESHEET_MAPPING,
    );
    expect(parsed.rows).toEqual([]);
    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      'The sample id column "sample" is missing from the header.',
      'The read 1 column "fastq_1" is missing from the header.',
      'The read 2 column "fastq_2" is missing from the header.',
    ]);
  });

  it("uses custom column mappings", () => {
    const parsed = parseSamplesheet(
      "id,reads,condition\ns1,b.fastq.gz,treated\n",
      { idColumn: "id", read1Column: "reads", read2Column: "" },
      uploaded,
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      id: "s1",
      reads: ["b.fastq.gz"],
      singleEnd: true,
      meta: { condition: "treated" },
    });
  });

  it("validates rows: field counts, ids, reads and uploads", () => {
    const parsed = parseSamplesheet(
      [
        "sample,fastq_1,fastq_2",
        "a,a_R1.fastq.gz",
        ",b.fastq.gz,",
        "my sample,b.fastq.gz,",
        "c,,",
        "d,missing.fastq.gz,",
        "e,b.fastq.gz,",
        "e,b.fastq.gz,",
      ].join("\n"),
      DEFAULT_SAMPLESHEET_MAPPING,
      uploaded,
    );
    expect(parsed.issues).toEqual([
      {
        level: "error",
        line: 2,
        message: "Line 2 has 2 fields, the header has 3.",
      },
      { level: "error", line: 3, message: "Line 3 has no sample id." },
      {
        level: "error",
        line: 4,
        message: 'Sample id "my sample" on line 4 contains spaces.',
      },
      { level: "error", line: 5, message: "Line 5 has no fastq_1 file." },
      {
        level: "error",
        line: 6,
        message:
          '"missing.fastq.gz" (line 6) isn\'t uploaded. Add it to a File Input node, or use an absolute path or URL.',
      },
      {
        level: "warning",
        line: 8,
        message:
          'Sample "e" also appears on line 7; each row is processed separately.',
      },
    ]);
    expect(summarizeSamplesheet(parsed)).toBe("5 problems to fix");
  });

  it("reports empty samplesheets", () => {
    expect(parseSamplesheet("", DEFAULT_SAMPLESHEET_MAPPING).issues).toEqual([
      { level: "error", message: "The samplesheet is empty." },
    ]);
    const headerOnly = parseSamplesheet(
      "sample,fastq_1,fastq_2\n",
      DEFAULT_SAMPLESHEET_MAPPING,
    );
    expect(headerOnly.issues).toEqual([
      { level: "warning", message: "The samplesheet has no samples yet." },
    ]);
    expect(summarizeSamplesheet(headerOnly)).toBe("No samples yet");
  });
});

describe("generateSamplesheetChannel", () => {
  it("builds [ meta, [ reads ] ] from the mapped columns", () => {
    const { params, channel } = generateSamplesheetChannel({
      channelName: "sheet_samples",
      paramName: "samplesheet_sheet",
      fileName: "samplesheet.csv",
      mapping: DEFAULT_SAMPLESHEET_MAPPING,
    });
    expect(params).toBe(
      'params.samplesheet_sheet = "${params.inputdir}/samplesheet.csv"\n',
    );
    expect(channel).toContain(
      "sheet_samples = Channel.fromPath(params.samplesheet_sheet, checkIfExists: true)",
    );
    expect(channel).toContain(".splitCsv(header: true, strip: true)");
    expect(channel).toContain(
      "def reads = [row['fastq_1'], row['fastq_2']].findAll { it }.collect { resolve(it) }",
    );
    expect(channel).toContain(
      "def meta = row.findAll { key, value -> !(key in ['sample', 'fastq_1', 'fastq_2']) } + [id: row['sample'], single_end: reads.size() == 1]",
    );
  });
});

describe("Samplesheet node in a workflow", () => {
  const node = (id: string, definitionId: string, data = {}): Node => {
    const definition = nodeDefinitions.find(
      (entry) => entry.id === definitionId,
    );
    if (!definition) throw new Error(`No node definition ${definitionId}`);
    return {
      id,
      type: definition.type,
      position: { x: 0, y: 0 },
      data: { ...definition.defaults, ...data },
    };
  };
  const nodes = [
    node("reads", "fileInput", {
      files: uploaded.map((name) => ({ name, content: "@r\nA\n+\nI\n" })),
    }),
    node("sheet", "samplesheet", {
      samplesheet: "sample,fastq_1,fastq_2\na,a_R1.fastq.gz,a_R2.fastq.gz\n",
    }),
    node("qc", "fastqc"),
  ];
  const edges: Edge[] = [
    {
      id: "e1",
      source: "sheet",
      sourceHandle: "samples",
      target: "qc",
      targetHandle: "reads",
    },
  ];

  it("feeds nf-core FastQC from the samplesheet channel", () => {
    const script = generateNextflowScript(
      nodes,
      edges,
      "qc",
      "results",
      "{workflow_name}",
    );
    expect(script.match(/params\.inputdir = /g)).toHaveLength(1);
    expect(script).toContain(
      'params.samplesheet_sheet = "${params.inputdir}/samplesheet.csv"',
    );
    expect(script).toContain("sheet_samples = Channel.fromPath(");
    expect(script).toMatch(/ch_\w+_reads_nfcore = sheet_samples\.map/);
    expect(script).toMatch(/FASTQC_QC\(ch_\w+_reads_nfcore\)/);
  });

  it("puts the samplesheet into the input files", () => {
    expect(getWorkflowInputFiles(nodes).map((file) => file.name)).toEqual([
      ...uploaded,
      "samplesheet.csv",
    ]);
  });
});

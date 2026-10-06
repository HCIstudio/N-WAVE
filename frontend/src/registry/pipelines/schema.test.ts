import { describe, expect, it } from "vitest";
import rnaseqSchema from "../../test/fixtures/nfcore-rnaseq-3.27.0.nextflow_schema.json";
import {
  buildPipelineParams,
  isPathParam,
  paramsByName,
  parsePipelineSchema,
  validatePipelineParams,
} from "./schema";

const groups = parsePipelineSchema(rnaseqSchema);
const params = paramsByName(groups);

describe("parsePipelineSchema with nf-core/rnaseq 3.27.0", () => {
  it("keeps the schema's groups in allOf order", () => {
    expect(groups.map((group) => group.title)).toEqual([
      "Input/output options",
      "Reference genome options",
      "Read trimming options",
      "Read filtering options",
      "UMI options",
      "Alignment options",
      "Optional outputs",
      "Quality Control",
      "Process skipping options",
      "Institutional config options",
      "Generic options",
    ]);
    expect(groups[0].description).toContain("Define where the pipeline");
  });

  it("reads types, defaults, enums, formats, help and required fields", () => {
    expect(params.get("input")).toMatchObject({
      type: "string",
      format: "file-path",
      required: true,
      pattern: "^\\S+\\.csv$",
    });
    expect(params.get("input")?.helpText).toContain("sample sheet");
    expect(params.get("outdir")).toMatchObject({
      format: "directory-path",
      required: true,
      minLength: 1,
    });
    expect(params.get("aligner")).toMatchObject({
      type: "string",
      default: "star_salmon",
      enum: ["star_salmon", "star_rsem", "hisat2", "bowtie2_salmon"],
      required: false,
    });
    expect(params.get("pseudo_aligner")?.enum).toEqual(["salmon", "kallisto"]);
    expect(params.get("skip_trimming")).toMatchObject({ type: "boolean" });
    expect(params.get("igenomes_ignore")?.hidden).toBe(true);
    // `help` is ["boolean", "string"]; a string holds both.
    expect(params.get("help")?.type).toBe("string");
    expect(
      [...params.values()].filter(
        (param) => param.type === "integer" || param.type === "number",
      ).length,
    ).toBe(8);
  });

  it("finds the path params", () => {
    const paths = [...params.values()]
      .filter(isPathParam)
      .map((param) => param.name);
    expect(paths).toEqual(
      expect.arrayContaining([
        "input",
        "fasta",
        "gtf",
        "salmon_index",
        "outdir",
      ]),
    );
    expect(paths).not.toContain("aligner");
  });

  it("supports draft-07 definitions and top-level properties", () => {
    expect(
      parsePipelineSchema({
        definitions: {
          io: { title: "IO", properties: { a: { type: "integer" } } },
        },
        allOf: [{ $ref: "#/definitions/io" }],
        properties: { extra: { type: "number", default: 1.5 } },
      }),
    ).toMatchObject([
      { id: "io", title: "IO", params: [{ name: "a", type: "integer" }] },
      { title: "Other parameters", params: [{ name: "extra", default: 1.5 }] },
    ]);
    expect(() => parsePipelineSchema("nope")).toThrow("isn't a JSON object");
  });
});

describe("pipeline param values", () => {
  it("keeps set values that differ from the defaults, typed", () => {
    expect(
      buildPipelineParams(groups, {
        aligner: "star_salmon",
        pseudo_aligner: "salmon",
        skip_trimming: true,
        min_trimmed_reads: "5",
        fasta: "  ",
        custom_param: "x",
      }),
    ).toEqual({
      pseudo_aligner: "salmon",
      skip_trimming: true,
      min_trimmed_reads: 5,
      custom_param: "x",
    });
  });

  it("validates required fields, enums, patterns and numbers", () => {
    expect(
      validatePipelineParams(groups, {}).map((issue) => issue.message),
    ).toEqual(["--input is required.", "--outdir is required."]);
    expect(
      validatePipelineParams(
        groups,
        {},
        {
          provided: new Set(["outdir"]),
          testProfile: true,
        },
      ),
    ).toEqual([]);
    expect(
      validatePipelineParams(
        groups,
        {
          input: "sheet.tsv",
          aligner: "bwa",
          fasta: "genome.fa",
          min_trimmed_reads: "many",
        },
        { provided: new Set(["outdir"]) },
      ).map((issue) => issue.message),
    ).toEqual([
      "The input must be a valid CSV file path with no spaces, ending in '.csv', and must exist.",
      "--min_trimmed_reads must be a whole number.",
      "--aligner must be one of: star_salmon, star_rsem, hisat2, bowtie2_salmon.",
    ]);
  });
});

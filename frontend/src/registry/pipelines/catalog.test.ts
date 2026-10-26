import { describe, expect, it } from "vitest";
import {
  parsePipelinesJson,
  pipelinePageUrl,
  searchPipelines,
  type PipelineInfo,
} from "./catalog";

describe("parsePipelinesJson", () => {
  it("lists named pipelines with their releases, newest first", () => {
    expect(
      parsePipelinesJson({
        remote_workflows: [
          {
            name: "rnaseq",
            description: "RNA-seq",
            archived: false,
            releases: [
              { tag_name: "dev", published_at: null },
              { tag_name: "3.26.0", published_at: "2025-08-01T00:00:00Z" },
              { tag_name: "3.27.0", published_at: "2025-10-01T00:00:00Z" },
            ],
          },
          { name: "atacseq", releases: "nope" },
          { name: "../evil" },
        ],
      }),
    ).toEqual([
      { name: "atacseq", description: "", versions: [], archived: false },
      {
        name: "rnaseq",
        description: "RNA-seq",
        versions: ["3.27.0", "3.26.0"],
        archived: false,
      },
    ]);
  });

  it("rejects something that isn't the list", () => {
    expect(() => parsePipelinesJson({})).toThrow(/remote_workflows/);
  });
});

describe("searchPipelines", () => {
  const pipelines: PipelineInfo[] = [
    { name: "atacseq", description: "ATAC-seq peak calling", versions: [], archived: false },
    { name: "chipseq", description: "ChIP-seq peak calling", versions: [], archived: false },
    { name: "rnaseq", description: "RNA sequencing", versions: [], archived: false },
    { name: "oldseq", description: "Gone", versions: [], archived: true },
  ];
  const names = (text: string) =>
    searchPipelines(pipelines, text).map((pipeline) => pipeline.name);

  it("puts name matches before description matches", () => {
    expect(names("")).toEqual(["atacseq", "chipseq", "rnaseq"]);
    expect(names("atac")).toEqual(["atacseq"]);
    expect(names("peak")).toEqual(["atacseq", "chipseq"]);
    expect(names("RNA")).toEqual(["rnaseq"]);
  });

  it("shows archived pipelines only when nothing else has the name", () => {
    expect(names("seq")).toEqual(["atacseq", "chipseq", "rnaseq"]);
    expect(names("old")).toEqual(["oldseq"]);
  });
});

it("links a pipeline's page, or the list", () => {
  expect(pipelinePageUrl("rnaseq")).toBe("https://nf-co.re/rnaseq");
  expect(pipelinePageUrl("")).toBe("https://nf-co.re/pipelines");
});

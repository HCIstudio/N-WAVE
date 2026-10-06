import fs from "node:fs";
import path from "node:path";
import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { summarizeParameters } from "../components/panels/input/ParametersPanel";
import { summarizeSamplesheet } from "../components/panels/input/SamplesheetPanel";
import type { NodeData } from "../components/nodes/BaseNode";
import { buildPipelineProjectFiles } from "../export/exportProject";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { getNodeCode } from "../registry/nodeCode";
import { getNodeParameters } from "../registry/params";
import {
  buildPipelineLaunch,
  getPipelineLaunchIssues,
} from "../registry/pipelines/launch";
import {
  getSamplesheetMapping,
  parseSamplesheet,
} from "../registry/samplesheet";
import { demoStore } from "./demoStore";
import { RNASEQ_EXAMPLE_ID, rnaseqExampleSeed } from "./rnaseqExample";

const nodes = rnaseqExampleSeed.nodes as unknown as Node<NodeData>[];
const edges = rnaseqExampleSeed.edges as Edge[];
const byType = (type: string) => nodes.filter((node) => node.type === type);

describe("the nf-core/rnaseq example", () => {
  it("is the same workflow the backend serves", () => {
    const backendDefinition = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../../backend/src/workflows/library/assets/rnaseq_pipeline_example.json",
        ),
        "utf-8",
      ),
    );
    expect(backendDefinition).toEqual(
      JSON.parse(JSON.stringify(rnaseqExampleSeed)),
    );
  });

  it("holds the test samplesheet and references, with matching subtitles", () => {
    const [sheet] = byType("samplesheet");
    const parsed = parseSamplesheet(
      String(sheet.data.samplesheet),
      getSamplesheetMapping(sheet.data),
    );
    expect(parsed.issues.filter((issue) => issue.level === "error")).toEqual(
      [],
    );
    expect(parsed.rows).toHaveLength(7);
    expect(sheet.data.subtitle).toBe(summarizeSamplesheet(parsed));

    const [references] = byType("parameters");
    const parameters = getNodeParameters(references.data);
    expect(parameters.map((parameter) => parameter.name)).toEqual([
      "fasta",
      "gtf",
    ]);
    expect(references.data.subtitle).toBe(summarizeParameters(parameters));
  });

  it("launches nf-core/rnaseq 3.27.0 with the test profile and its inputs", () => {
    expect(getPipelineLaunchIssues(nodes, edges)).toEqual([]);
    const launch = buildPipelineLaunch(nodes, edges);
    expect(launch?.command).toBe(
      "nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results",
    );
    expect(launch?.params).toEqual({
      input: "inputs/samplesheet.csv",
      fasta:
        "https://raw.githubusercontent.com/nf-core/test-datasets/626c8fab639062eade4b10747e919341cbf9b41a/reference/genome.fasta",
      gtf: "https://raw.githubusercontent.com/nf-core/test-datasets/626c8fab639062eade4b10747e919341cbf9b41a/reference/genes_with_empty_tid.gtf.gz",
    });
    // Remote reads stay URLs; only the samplesheet travels as a file.
    expect(launch?.inputFiles.map((file) => file.name)).toEqual([
      "samplesheet.csv",
    ]);
    expect(launch?.inputFiles[0].content).toBe(
      byType("samplesheet")[0].data.samplesheet,
    );
    if (!launch) throw new Error("no launch");
    expect(
      Object.keys(
        buildPipelineProjectFiles({
          workflowName: "nf-core/rnaseq Example",
          launch,
        }),
      ).sort(),
    ).toEqual(["README.md", "inputs/samplesheet.csv", "params.json", "run.sh"]);
  });

  it("explains itself with notes that add no code", () => {
    const notes = byType("note");
    expect(notes.length).toBeGreaterThanOrEqual(4);
    for (const note of notes) {
      expect(String(note.data.noteText).length).toBeGreaterThan(0);
      expect(getNodeCode(note)).toBeNull();
    }
    expect(edges.every((edge) => !edge.source.includes("note"))).toBe(true);
    expect(generateNextflowScript(notes, [], "notes", "results")).toBe(
      generateNextflowScript([], [], "notes", "results"),
    );
  });

  it("is a read-only built-in in the demo, with its resource limits", () => {
    const descriptor = demoStore.get(RNASEQ_EXAMPLE_ID);
    expect(descriptor).toMatchObject({
      isBuiltin: true,
      isReadOnly: true,
      executionSettings: { resources: { maxCpus: 4, maxMemory: "8.GB" } },
    });
    expect(demoStore.list().map((workflow) => workflow._id)).toContain(
      RNASEQ_EXAMPLE_ID,
    );
  });
});

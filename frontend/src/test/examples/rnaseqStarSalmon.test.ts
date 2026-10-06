import fs from "node:fs";
import path from "node:path";
import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { summarizeParameters } from "../../components/panels/input/ParametersPanel";
import { summarizeSamplesheet } from "../../components/panels/input/SamplesheetPanel";
import { extractNextflowConfig } from "../../export/exportProject";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { getMissingNfCoreComponents } from "../../registry/nfcore/missingComponents";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "../../registry/nodeDefinitions";
import { getNodeParameters } from "../../registry/params";
import {
  getSamplesheetMapping,
  parseSamplesheet,
} from "../../registry/samplesheet";
import {
  buildRnaseqStarSalmonExample,
  RNASEQ_STAR_SALMON_COMPONENTS,
  RNASEQ_STAR_SALMON_ID,
} from "./rnaseqStarSalmon";

// The stored copies of the example. Regenerate them with
// UPDATE_EXAMPLES=1 npx vitest run src/test/examples
const STORED = [
  path.resolve(__dirname, "../../demo/rnaseqStarSalmonExample.json"),
  path.resolve(
    __dirname,
    "../../../../backend/src/workflows/library/assets/rnaseq_star_salmon_example.json",
  ),
];

const { nodes, edges, definitions } = buildRnaseqStarSalmonExample();

const example = {
  id: RNASEQ_STAR_SALMON_ID,
  name: "RNA-seq (STAR + Salmon)",
  description:
    "The default nf-core/rnaseq route built from library nodes: genome preparation, FastQC, Trim Galore, STAR, Salmon, SAMtools and MultiQC on the pipeline's test data. Every step is a node you can inspect and edit.",
  components: RNASEQ_STAR_SALMON_COMPONENTS,
  nodes,
  edges,
  resources: { maxCpus: 4, maxMemory: "8.GB" },
};

const generate = () =>
  extractNextflowConfig(
    generateNextflowScript(
      nodes as Node[],
      edges as Edge[],
      example.name,
      "results",
      "{workflow_name}",
    ),
  );

describe("the RNA-seq (STAR + Salmon) example", () => {
  it("is stored as built, for the demo and the backend", () => {
    const expected = JSON.parse(JSON.stringify(example));
    for (const file of STORED) {
      if (process.env.UPDATE_EXAMPLES) {
        fs.writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);
      }
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(expected);
    }
  });

  it("is wired port to port, with subtitles the panels agree with", () => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      expect(
        (source?.data.outputs ?? []).map((port: { name: string }) => port.name),
      ).toContain(edge.sourceHandle);
      expect(
        (target?.data.inputs ?? []).map((port: { name: string }) => port.name),
      ).toContain(edge.targetHandle);
    }
    const samples = byId.get("samples") as Node<NodeData>;
    const parsed = parseSamplesheet(
      String(samples.data.samplesheet),
      getSamplesheetMapping(samples.data),
    );
    expect(parsed.issues.filter((issue) => issue.level === "error")).toEqual(
      [],
    );
    expect(samples.data.subtitle).toBe(summarizeSamplesheet(parsed));
    const reference = byId.get("reference") as Node<NodeData>;
    expect(reference.data.subtitle).toBe(
      summarizeParameters(getNodeParameters(reference.data)),
    );
  });

  it("lists its nf-core components as missing until they're installed", () => {
    unregisterDynamicNodeDefinitions(
      definitions.map((definition) => definition.id),
    );
    expect(getMissingNfCoreComponents(nodes)).toEqual(
      [...RNASEQ_STAR_SALMON_COMPONENTS].sort(),
    );
    registerDynamicNodeDefinitions(definitions);
    expect(getMissingNfCoreComponents(nodes)).toEqual([]);
  });

  it("generates every step, in an order Nextflow accepts", () => {
    registerDynamicNodeDefinitions(definitions);
    const { script, config } = generate();
    for (const component of RNASEQ_STAR_SALMON_COMPONENTS) {
      const folder = component
        .replace("nf-core/subworkflows/", "subworkflows/nf-core/")
        .replace(/^nf-core\//, "modules/nf-core/");
      expect(script).toContain(`from './${folder}/main'`);
    }
    // The mixed QC reports are defined before MultiQC reads them.
    expect(script.indexOf("qc_reports_reports = ")).toBeLessThan(
      script.indexOf("= qc_reports_reports"),
    );
    // Paired-end outputs are flattened before MultiQC collects them.
    expect(script).toContain(".flatten().collect()");
    expect(config).toContain("--quantTranscriptomeSAMoutput BanSingleEnd");
    expect(config).toContain(`ext.prefix = { "\${meta.id}.filtered" }`);
    expect(config).toContain(
      `path: { "\${params.outdir}/salmon_quantification" }`,
    );
    expect(config).toContain(
      "withName: 'NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_BAM_SORT_STATS:.*' {",
    );
  });
});

import fs from "node:fs";
import path from "node:path";
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../../components/nodes/BaseNode";
import { summarizeSamplesheet } from "../../components/panels/input/SamplesheetPanel";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { connectionHints } from "../../registry/portTypes";
import { getMissingNfCoreComponents } from "../../registry/nfcore/missingComponents";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "../../registry/nodeDefinitions";
import { getSamplesheetMapping, parseSamplesheet } from "../../registry/samplesheet";
import { buildQcFastqTemplate, QC_FASTQ_COMPONENTS } from "./qcFastq";

// The stored copy of the template. Regenerate it with
// UPDATE_EXAMPLES=1 npx vitest run src/test/examples
const STORED = path.resolve(__dirname, "../../templates/qcFastqTemplate.json");

const { nodes, edges, definitions } = buildQcFastqTemplate();

const template = {
  name: "QC of FASTQ files",
  description:
    "FastQC on each sample's reads and one MultiQC report, starting from two samples of the nf-core test data.",
  components: QC_FASTQ_COMPONENTS,
  nodes,
  edges,
};

describe("the QC of FASTQ files template", () => {
  it("is stored as built", () => {
    const expected = JSON.parse(JSON.stringify(template));
    if (process.env.UPDATE_EXAMPLES) {
      fs.writeFileSync(STORED, `${JSON.stringify(expected, null, 2)}\n`);
    }
    expect(JSON.parse(fs.readFileSync(STORED, "utf8"))).toEqual(expected);
  });

  it("is wired port to port, with ports that fit", () => {
    registerDynamicNodeDefinitions(definitions);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of edges) {
      expect((byId.get(edge.source)?.data.outputs ?? []).map((port) => port.name)).toContain(edge.sourceHandle);
      expect((byId.get(edge.target)?.data.inputs ?? []).map((port) => port.name)).toContain(edge.targetHandle);
    }
    expect(connectionHints(nodes, edges)).toEqual({});
    const samples = byId.get("samples") as Node<NodeData>;
    const parsed = parseSamplesheet(String(samples.data.samplesheet), getSamplesheetMapping(samples.data));
    expect(parsed.issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(samples.data.subtitle).toBe(summarizeSamplesheet(parsed));
  });

  it("lists its nf-core components as missing until they're installed", () => {
    unregisterDynamicNodeDefinitions(definitions.map((definition) => definition.id));
    expect(getMissingNfCoreComponents(nodes)).toEqual([...QC_FASTQ_COMPONENTS].sort());
    registerDynamicNodeDefinitions(definitions);
    expect(getMissingNfCoreComponents(nodes)).toEqual([]);
  });

  it("generates FastQC and MultiQC", () => {
    registerDynamicNodeDefinitions(definitions);
    const script = generateNextflowScript(nodes as Node[], edges as Edge[], template.name, "results", "{workflow_name}");
    expect(script).toContain("from './modules/nf-core/fastqc/main'");
    expect(script).toContain("from './modules/nf-core/multiqc/main'");
    expect(script).toContain(".flatten().collect()");
  });
});

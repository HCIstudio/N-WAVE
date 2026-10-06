import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { summarizeParameters } from "../components/panels/input/ParametersPanel";
import { generateNextflowScript } from "../generators";
import { createNodeDefinitionFromNfCoreManifest } from "./nfcoreModuleAdapters";
import catalog from "./nfcore/catalog.json";
import {
  buildNfCoreManifest,
  type NfCoreCatalogEntryForManifest,
} from "./nfcore/manifest";
import {
  nodeDefinitions,
  registerDynamicNodeDefinitions,
} from "./nodeDefinitions";
import {
  generateParameterDeclarations,
  getParameterPorts,
  groovyStringWithParams,
  parameterLiteral,
  validateParameters,
  type WorkflowParameter,
} from "./params";

const parameters: WorkflowParameter[] = [
  { name: "fasta", type: "file", value: "genome.fa" },
  { name: "gtf", type: "file", value: "https://example.org/genes.gtf" },
  { name: "genome_name", type: "text", value: "R64-1-1" },
  { name: "read_length", type: "number", value: "100" },
  { name: "skip_qc", type: "boolean", value: "true" },
];

describe("parameterLiteral / groovyStringWithParams", () => {
  it("writes typed Groovy literals", () => {
    expect(parameters.map(parameterLiteral)).toEqual([
      "'genome.fa'",
      "'https://example.org/genes.gtf'",
      "'R64-1-1'",
      "100",
      "true",
    ]);
    expect(parameterLiteral({ name: "x", type: "text", value: "it's" })).toBe(
      "'it\\'s'",
    );
  });

  it("interpolates only ${params.x} references", () => {
    expect(groovyStringWithParams("--quiet")).toBe("'--quiet'");
    expect(
      groovyStringWithParams(
        '--genome ${params.genome_name} --tag "$HOME" \\n',
      ),
    ).toBe('"--genome ${params.genome_name} --tag \\"\\$HOME\\" \\\\n"');
  });
});

describe("validateParameters", () => {
  it("accepts well-formed parameters", () => {
    expect(validateParameters(parameters, [], ["genome.fa"])).toEqual([]);
  });

  it("reports bad, reserved and duplicate names, numbers and files", () => {
    const issues = validateParameters(
      [
        { name: "2fast", type: "text", value: "" },
        { name: "outdir", type: "text", value: "" },
        { name: "samplesheet_x", type: "text", value: "" },
        { name: "dup", type: "text", value: "" },
        { name: "dup", type: "text", value: "" },
        { name: "taken", type: "text", value: "" },
        { name: "n", type: "number", value: "many" },
        { name: "empty", type: "file", value: " " },
        { name: "missing", type: "file", value: "genes.gtf" },
      ],
      ["taken"],
    );
    expect(issues.map((issue) => [issue.level, issue.name])).toEqual([
      ["error", "2fast"],
      ["error", "outdir"],
      ["error", "samplesheet_x"],
      ["error", "dup"],
      ["error", "taken"],
      ["error", "n"],
      ["error", "empty"],
      ["warning", "missing"],
    ]);
  });
});

describe("generateParameterDeclarations", () => {
  it("declares params in the script and config, and a channel per reference", () => {
    const { script, config, channels } = generateParameterDeclarations(
      parameters,
      (parameter) => `refs_${parameter.name}`,
    );
    expect(script).toBe(
      [
        "params.fasta = 'genome.fa'",
        "params.gtf = 'https://example.org/genes.gtf'",
        "params.genome_name = 'R64-1-1'",
        "params.read_length = 100",
        "params.skip_qc = true",
        "",
      ].join("\n"),
    );
    expect(config).toEqual([
      "fasta = 'genome.fa'",
      "gtf = 'https://example.org/genes.gtf'",
      "genome_name = 'R64-1-1'",
      "read_length = 100",
      "skip_qc = true",
    ]);
    expect(channels).toBe(
      [
        "refs_fasta = Channel.of(nwaveInputFile(params.fasta))",
        "refs_gtf = Channel.of(nwaveInputFile(params.gtf))",
        "",
      ].join("\n"),
    );
    expect(getParameterPorts(parameters).map((port) => port.name)).toEqual([
      "fasta",
      "gtf",
    ]);
    expect(summarizeParameters(parameters)).toBe("3 parameters, 2 references");
  });

  it("skips invalid and reserved names", () => {
    expect(
      generateParameterDeclarations(
        [
          { name: "outdir", type: "text", value: "x" },
          { name: "bad name", type: "file", value: "x" },
        ],
        () => "unused",
      ),
    ).toEqual({ script: "", config: [], channels: "" });
  });
});

describe("Parameters node in an rnaseq-style workflow", () => {
  const entries = (catalog as { modules: NfCoreCatalogEntryForManifest[] })
    .modules;
  const moduleNode = (id: string, modulePath: string, data = {}): Node => {
    const entry = entries.find(
      (candidate) => candidate.modulePath === modulePath,
    );
    if (!entry) throw new Error(`${modulePath} is not in the catalog`);
    const definition = createNodeDefinitionFromNfCoreManifest(
      buildNfCoreManifest(entry),
    );
    registerDynamicNodeDefinitions([definition]);
    return {
      id,
      type: definition.type,
      position: { x: 0, y: 0 },
      data: { ...definition.defaults, ...data },
    };
  };
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
    moduleNode("align", "star/align", {
      nfcoreExtArgs: "--outSAMattrRGline ID:${params.genome_name}",
    }),
    moduleNode("genome", "star/genomegenerate"),
    node("refs", "parameters", {
      parameters,
      outputs: getParameterPorts(parameters),
    }),
    node("sheet", "samplesheet", {
      samplesheet:
        "sample,fastq_1,fastq_2\na,https://example.org/a_1.fq.gz,https://example.org/a_2.fq.gz\n",
    }),
  ];
  const edges: Edge[] = [
    {
      id: "e1",
      source: "refs",
      sourceHandle: "fasta",
      target: "genome",
      targetHandle: "fasta",
    },
    {
      id: "e2",
      source: "refs",
      sourceHandle: "gtf",
      target: "genome",
      targetHandle: "gtf",
    },
    {
      id: "e3",
      source: "genome",
      sourceHandle: "index",
      target: "align",
      targetHandle: "index",
    },
    {
      id: "e4",
      source: "refs",
      sourceHandle: "gtf",
      target: "align",
      targetHandle: "gtf",
    },
    {
      id: "e5",
      source: "sheet",
      sourceHandle: "samples",
      target: "align",
      targetHandle: "reads",
    },
  ];
  const script = generateNextflowScript(
    nodes,
    edges,
    "rnaseq",
    "results",
    "{workflow_name}",
  );

  it("declares the parameters once, in the script and the embedded config", () => {
    expect(script).toContain("params.fasta = 'genome.fa'\n");
    expect(script).toMatch(
      /\/\* N-WAVE_NEXTFLOW_CONFIG\nparams \{\n {2}fasta = 'genome\.fa'\n[\s\S]*\n\}\nprocess \{/,
    );
    expect(script.match(/params\.inputdir = /g)).toHaveLength(1);
  });

  it("feeds the FASTA and GTF to genome preparation and the GTF to alignment", () => {
    expect(script).toContain("    refs_fasta = Channel.of(nwaveInputFile(params.fasta))");
    // Input files resolve through one top-level helper (strict syntax).
    expect(script).toContain("def nwaveInputFile(path) {");
    expect(script).toMatch(/ch_\w+_genome_fasta_nfcore = refs_fasta\n/);
    expect(script).toMatch(/ch_\w+_genome_gtf_nfcore = refs_gtf\.first\(\)/);
    expect(script).toMatch(
      /ch_\w+_align_index_nfcore = genome_index\.first\(\)/,
    );
    expect(script).toMatch(/ch_\w+_align_gtf_nfcore = refs_gtf\.first\(\)/);
    expect(script).toMatch(/ch_\w+_align_reads_nfcore = sheet_samples\n/);
    expect(script).toMatch(
      /ALIGN_ALIGN\(ch_\w+_align_reads_nfcore, ch_\w+_align_index_nfcore, ch_\w+_align_gtf_nfcore, false\)/,
    );
  });

  it("fills params into module arguments when the task runs", () => {
    expect(script).toContain(
      'ext.args = { "--outSAMattrRGline ID:${params.genome_name}" }',
    );
  });
});

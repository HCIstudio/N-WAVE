import type { Edge, Node } from "@xyflow/react";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { groupsOf } from "../groups/groups";
import catalog from "../registry/nfcore/catalog.json";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import schema from "./daw-model.schema.json";
import { DAW_SCHEMA, type Daw, type DawModelFile, looksLikeDawModel, readDawModel } from "./dawModel";
import { type DawCatalog, fromDawModel } from "./fromDawModel";
import { classifyNode, serializeDawModel, toDawModel, withoutNwaveData } from "./toDawModel";

// The schema in the repo (for other tools) and what N-WAVE writes must agree.
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const generate = (nodes: Node<NodeData>[], edges: Edge[], name: string) => generateNextflowScript(nodes, edges, name, "results");
const fixtures = buildLintFixtures();
const fixture = (name: string) => fixtures.find((candidate) => candidate.name === name) as (typeof fixtures)[number];
const elements = (daw: Daw): Array<{ id: string; type: string }> => [
  ...daw.tasks,
  ...daw.storages,
  ...daw.daws.flatMap((sub) => [{ id: sub.id, type: "DAW" }, ...elements(sub)]),
];
const connections = (daw: Daw): Daw["interconnections"] => [...daw.interconnections, ...daw.daws.flatMap(connections)];

describe("export, import, export through the DAW model", () => {
  for (const { name, description, nodes, edges } of fixtures) {
    it(`gives ${name} back as it was`, () => {
      const model = toDawModel({ nodes, edges, workflowName: description });
      const text = serializeDawModel(model);
      expect(looksLikeDawModel(text)).toBe(true);
      expect(validate(JSON.parse(text)) || validate.errors).toBe(true);
      expect(validate(JSON.parse(serializeDawModel(withoutNwaveData(model)))) || validate.errors).toBe(true);
      const read = readDawModel(text);
      expect(read.warnings).toEqual([]);
      const canvas = fromDawModel(read.model);
      // Nothing to say, but that placeholders (the skeleton's) are still to do.
      expect(canvas.warnings.filter((warning) => !/placeholder/.test(warning))).toEqual([]);
      // The same model again, and the same Nextflow.
      expect(serializeDawModel(toDawModel({ nodes: canvas.nodes, edges: canvas.edges, workflowName: canvas.name }))).toBe(text);
      expect(generate(canvas.nodes, canvas.edges, description)).toBe(generate(nodes, edges, description));
      expect(canvas.nodes.map((node) => [node.type, node.data.label, node.position])).toEqual(
        nodes.map((node) => [node.type, node.data.label, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]),
      );
    });

    it(`opens ${name} from the metamodel's elements alone`, () => {
      const model = withoutNwaveData(toDawModel({ nodes, edges, workflowName: description }));
      const canvas = fromDawModel(readDawModel(serializeDawModel(model)).model, catalog as unknown as DawCatalog);
      registerDynamicNodeDefinitions(canvas.definitions);
      // Every element is a node (notes aren't in the metamodel), every connection a connection.
      const expected = nodes.filter((node) => node.type !== "note");
      expect(canvas.nodes).toHaveLength(expected.length);
      expect(new Set(canvas.edges.map((edge) => `${edge.source}->${edge.target}`))).toEqual(
        new Set(edges.map((edge) => `${edge.source}->${edge.target}`)),
      );
      expect(groupsOf(canvas.nodes).size).toBe(groupsOf(nodes).size);
      // And the canvas is one N-WAVE can write as Nextflow.
      expect(() => generate(canvas.nodes, canvas.edges, description)).not.toThrow();
    });
  }
});

describe("the mapping", () => {
  it("follows the metamodel's Nextflow mapping", () => {
    const demo = fixture("grouped-demo-3");
    const model = toDawModel({ nodes: demo.nodes, edges: demo.edges, workflowName: "Demo 3" });
    const all = elements(model.daw);
    const typeOf = (id: string) => all.find((element) => element.id === id)?.type;
    expect(typeOf("samples")).toBe("FileStorage");
    // The reference genome and annotation are files.
    expect(typeOf("reference")).toBe("FileStorage");
    expect(typeOf("star_align")).toBe("Executable");
    expect(typeOf("bam_sort_stats")).toBe("DAW");
    expect(typeOf("qc_reports")).toBe("InlineDescription");
    expect(model.daw.daws.map((sub) => sub.id)).toEqual(expect.arrayContaining(["group:PREPARE_GENOME", "group:READ_QC", "group:ALIGN_AND_QUANTIFY"]));
    const star = model.daw.daws.flatMap((sub) => sub.tasks).find((task) => task.id === "star_align");
    expect(star?.implementation).toEqual({ language: "nextflow", reference: "nf-core/star/align" });
    expect(star?.executionContext?.config?.join("\n")).toContain("withName: 'STAR_ALIGNMENT'");
    expect(new Set(connections(model.daw).map((interconnection) => interconnection.type))).toEqual(new Set(["StreamingInterconnection"]));
    // Notes have no class in the metamodel.
    expect(model.nwave?.notes).toHaveLength(demo.nodes.filter((node) => node.type === "note").length);
  });

  it("tells code that routes data, monitors and unimplemented steps apart", () => {
    const node = (type: string, data: Record<string, unknown>) => ({ id: "n", type, position: { x: 0, y: 0 }, data }) as Node<NodeData>;
    expect(classifyNode(node("channelOperator", { channelOperatorCode: "output.a = input.x.branch { v -> small: v < 3 }" }))).toEqual({ kind: "task", type: "SkipTask" });
    expect(classifyNode(node("channelOperator", { channelOperatorCode: "if (params.trim) {\n  TRIM(ch)\n}" }))).toEqual({ kind: "task", type: "SkipTask" });
    expect(classifyNode(node("channelOperator", { channelOperatorCode: "output.a = input.x.map { v -> v * 2 }" }))).toEqual({ kind: "task", type: "InlineDescription" });
    expect(classifyNode(node("channelOperator", { placement: "onComplete", channelOperatorCode: "println 'done'" }))).toEqual({ kind: "task", type: "Monitor" });
    expect(classifyNode(node("process", { placeholder: true, customNodeDefinition: { source: 'echo "X has no implementation yet"' } }))).toEqual({ kind: "task", type: "Task" });
    // Once its code is written, it is a step like any other.
    expect(classifyNode(node("process", { placeholder: true, customNodeDefinition: { source: "process X { script: 'x' }" } }))).toEqual({ kind: "task", type: "Executable" });
    expect(classifyNode(node("parameters", { parameters: [{ name: "k", type: "number", value: "3" }] }))).toEqual({ kind: "storage", type: "IntermediateStorage" });
  });

  it("leaves run profiles out of the model", () => {
    const demo = fixture("demo-1-text-basics");
    const model = toDawModel({
      nodes: demo.nodes,
      edges: demo.edges,
      workflowName: "Demo",
      settings: { mode: "local", runProfile: "cluster", runProfiles: [{ id: "cluster", account: "secret-account" }] },
    });
    expect(model.nwave?.executionSettings).toEqual({ mode: "local" });
    expect(serializeDawModel(model)).not.toContain("secret-account");
  });
});

describe("an abstract workflow", () => {
  const abstract: DawModelFile = {
    schema: DAW_SCHEMA,
    metamodel: {},
    daw: {
      id: "average",
      name: "Average of a stream of values",
      tasks: [
        { id: "to-float", name: "Int to float", type: "InlineDescription", implementation: { language: "nextflow", code: "output.floats = input.values.map { v -> v as float }" }, inputs: [{ name: "values" }], outputs: [{ name: "floats" }] },
      ],
      storages: [
        { id: "input", name: "Input", type: "IntermediateStorage" },
        { id: "output", name: "Output", type: "FileStorage" },
      ],
      interconnections: [
        { id: "i1", type: "StreamingInterconnection", from: { element: "input" }, to: { element: "to-float", port: "values" } },
        { id: "i2", type: "StreamingInterconnection", from: { element: "to-float", port: "floats" }, to: { element: "sum" } },
        { id: "i3", type: "StreamingInterconnection", from: { element: "to-float", port: "floats" }, to: { element: "count" } },
        { id: "i4", type: "StreamingInterconnection", from: { element: "sum", port: "total" }, to: { element: "division", port: "sum" } },
        { id: "i5", type: "StreamingInterconnection", from: { element: "count" }, to: { element: "division", port: "count" } },
        { id: "i6", type: "SimpleSendDataInterconnection", from: { element: "division" }, to: { element: "output" } },
      ],
      daws: [
        {
          id: "statistics",
          name: "Sum and count",
          tasks: [
            { id: "sum", name: "Sum", type: "Task", description: "Add up the values." },
            { id: "count", name: "Count", type: "Task" },
          ],
          storages: [],
          interconnections: [],
          daws: [],
        },
        { id: "division", name: "Division", reference: "elsewhere/division", tasks: [], storages: [], interconnections: [], daws: [] },
      ],
    },
  };

  it("opens as a skeleton: placeholders for what has no implementation, a group for a sub-DAW", () => {
    expect(validate(abstract) || validate.errors).toBe(true);
    const canvas = fromDawModel(readDawModel(JSON.stringify(abstract)).model);
    const byLabel = new Map(canvas.nodes.map((node) => [String(node.data.label), node]));
    expect([...byLabel.keys()].sort()).toEqual(["Count", "Division", "Input", "Int to float", "Output", "Sum"]);
    expect(byLabel.get("Input")?.type).toBe("fileInput");
    expect(byLabel.get("Output")?.type).toBe("outputDisplay");
    expect(byLabel.get("Int to float")?.type).toBe("channelOperator");
    for (const label of ["Sum", "Count", "Division"]) {
      expect(byLabel.get(label)?.data.placeholder, label).toBe(true);
    }
    expect(byLabel.get("Sum")?.data.group).toBe("SUM_AND_COUNT");
    expect(byLabel.get("Division")?.data.group).toBeUndefined();
    expect(byLabel.get("Division")?.data.subtitle).toBe("Sub-workflow elsewhere/division: to do");
    expect(canvas.edges).toHaveLength(6);
    expect(canvas.warnings[0]).toMatch(/^3 steps have no implementation in the model/);
    // Laid out left to right, in the order the data flows.
    expect(byLabel.get("Input")?.position.x).toBeLessThan(byLabel.get("Division")?.position.x ?? 0);

    // The skeleton is a workflow N-WAVE writes; a placeholder says what is missing when it runs.
    const script = generate(canvas.nodes, canvas.edges, "Average");
    expect(script).toContain("workflow SUM_AND_COUNT {");
    expect(script).toContain('echo "Sum has no implementation yet" >&2');
    expect(script).toContain("// Add up the values.");

    // Exported again, the placeholders are Tasks without an implementation.
    const again = toDawModel({ nodes: canvas.nodes, edges: canvas.edges, workflowName: canvas.name });
    const tasks = [...again.daw.tasks, ...again.daw.daws.flatMap((sub) => sub.tasks)];
    expect(tasks.filter((task) => task.type === "Task").map((task) => task.name).sort()).toEqual(["Count", "Division", "Sum"]);
    expect(tasks.find((task) => task.name === "Sum")?.implementation).toBeUndefined();
  });

  it("says what is wrong with a file that isn't a model", () => {
    expect(() => readDawModel("not json")).toThrow("isn't valid JSON");
    expect(() => readDawModel("{}")).toThrow(`no "schema": "${DAW_SCHEMA}"`);
    expect(() => readDawModel(JSON.stringify({ schema: "n-wave-daw/9", daw: {} }))).toThrow("reads n-wave-daw/1");
    expect(() => readDawModel(JSON.stringify({ ...abstract, daw: { ...abstract.daw, tasks: [{ id: "input", name: "Twice", type: "Task" }] } }))).toThrow("used twice");
    expect(() =>
      readDawModel(JSON.stringify({ ...abstract, daw: { ...abstract.daw, daws: [], interconnections: [{ id: "x", type: "Interconnection", from: { element: "input" }, to: { element: "nowhere" } }] } })),
    ).toThrow("“nowhere”, which the model doesn't have");
    const odd = readDawModel(JSON.stringify({ ...abstract, daw: { ...abstract.daw, daws: [], interconnections: [], tasks: [{ id: "t", name: "T", type: "Wizardry" }] } }));
    expect(odd.warnings).toEqual(["daw.tasks[0] has the type “Wizardry”, which the metamodel doesn't have; read as Task."]);
    expect(looksLikeDawModel("workflow { }")).toBe(false);
  });
});

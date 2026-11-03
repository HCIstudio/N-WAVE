import { describe, it, expect } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { makeNode } from "../test/nodes";
import { importNextflowWorkflow } from "./importNextflowWorkflow";

// A script written by hand: its processes become custom processes with
// their own code, the workflow block their connections.
const HAND_WRITTEN = `
params.reads = 'data/*.txt'
params.word = 'Barry'
params.lines = 10

process FIND {
  input:
  path text
  val word

  output:
  path 'found.txt', emit: found

  script:
  """
  grep "\${word}" \${text} > found.txt || true
  """
}

process HEAD {
  input:
  path text
  output:
  path 'head.txt'
  script:
  """
  head -n \${params.lines} \${text} > head.txt
  """
}

workflow {
  ch_reads = channel.fromPath(params.reads)

  // Look for the word.
  FIND(ch_reads, params.word)
  HEAD(FIND.out.found)
  HEAD.out.view()
}
`;

const byLabel = (nodes: Node<NodeData>[], label: string) => nodes.find((node) => node.data.label === label);

describe("importing a script written by hand", () => {
  it("throws when the source is empty", async () => {
    await expect(importNextflowWorkflow({ rawSource: "   " })).rejects.toThrow(/required/i);
  });

  it("makes each process a custom process that keeps its code and its inputs and outputs", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN });
    const find = byLabel(draft.nodes, "FIND");
    expect(find?.type).toBe("process");
    expect(find?.data.customNodeDefinition).toMatchObject({ processName: "FIND" });
    expect(String((find?.data.customNodeDefinition as { source?: string } | undefined)?.source)).toContain('grep "${word}"');
    expect(find?.data.inputs?.map((port) => port.name)).toEqual(["text"]);
    expect(find?.data.outputs?.map((port) => port.name)).toEqual(["found"]);
    // A value argument is a setting.
    expect(find?.data.customNodeValues).toEqual({ word: "params.word" });
  });

  it("connects steps by the channels they read", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN });
    const label = new Map(draft.nodes.map((node) => [node.id, node.data.label]));
    const pairs = draft.edges.map((edge) => `${label.get(edge.source)}.${edge.sourceHandle} -> ${label.get(edge.target)}.${edge.targetHandle}`);
    expect(pairs).toEqual(expect.arrayContaining(["ch_reads.ch_reads -> FIND.text", "FIND.found -> HEAD.text"]));
  });

  it("keeps other channel code as channel operators, with the script's names", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN });
    const reads = byLabel(draft.nodes, "ch_reads");
    expect(reads?.type).toBe("channelOperator");
    expect(reads?.data.channelOperatorCode).toBe("output.ch_reads = channel.fromPath(params.reads)");
    const view = draft.nodes.find((node) => node.type === "channelOperator" && node !== reads);
    expect(view?.data.channelOperatorCode).toBe("input.head.view()");
  });

  it("keeps the params the steps read in a Parameters node", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN });
    const parameters = draft.nodes.find((node) => node.type === "parameters");
    expect(parameters?.data.parameters).toEqual([
      { name: "reads", type: "text", value: "data/*.txt" },
      { name: "word", type: "text", value: "Barry" },
      { name: "lines", type: "number", value: "10" },
    ]);
  });

  it("writes back code that does the same", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN });
    const script = generateNextflowScript(draft.nodes, draft.edges, draft.name, "results", "{workflow_name}");
    const workflow = script.slice(script.indexOf("workflow {"));
    expect(workflow).toContain("ch_reads = channel.fromPath(params.reads)");
    expect(workflow).toContain("FIND(ch_reads, params.word)");
    expect(workflow).toContain("HEAD(FIND.out.found)");
    expect(workflow).toContain("HEAD.out.view()");
    expect(script).toContain("params.word = 'Barry'");
    expect(script).toContain('grep "${word}" ${text} > found.txt || true');
  });

  it("names the workflow after a named workflow, then a process", async () => {
    expect((await importNextflowWorkflow({ rawSource: "workflow MAIN {\n}" })).name).toBe("MAIN");
    expect((await importNextflowWorkflow({ rawSource: "process ONLY {\n script:\n 'echo'\n}" })).name).toBe("ONLY");
    expect((await importNextflowWorkflow({ rawSource: "params.x = 1" })).name).toBe("Imported Nextflow Workflow");
    expect((await importNextflowWorkflow({ rawSource: HAND_WRITTEN, name: "  Mine " })).name).toBe("Mine");
  });

  it("marks the import as an editable, imported Nextflow workflow", async () => {
    const draft = await importNextflowWorkflow({ rawSource: HAND_WRITTEN, sourceKey: "pipe.nf" });
    expect(draft).toMatchObject({ originType: "imported", sourceFormat: "nextflow", isReadOnly: false, sourceKey: "pipe.nf" });
    expect(draft.rawSource).toContain("workflow {");
  });

  it("says what it couldn't do", async () => {
    expect((await importNextflowWorkflow({ rawSource: "workflow { }" })).importWarnings.join(" ")).toMatch(/no nextflow process/i);
    expect((await importNextflowWorkflow({ rawSource: "process A {\n script:\n 'echo'\n}" })).importWarnings.join(" ")).toMatch(
      /No workflow block was found/,
    );
    const unknown = await importNextflowWorkflow({
      rawSource: "include { TOOL } from './modules/local/tool'\nworkflow {\n  TOOL(channel.of(1))\n}",
    });
    expect(unknown.importWarnings.join(" ")).toMatch(/TOOL is included from \.\/modules\/local\/tool/);
  });

  it("makes a named workflow a step, with the processes only it calls", async () => {
    const draft = await importNextflowWorkflow({
      rawSource: [
        "process COUNT {",
        "  input: path x",
        "  output: path 'n.txt', emit: n",
        "  script: \"wc -l ${x} > n.txt\"",
        "}",
        "workflow COUNT_ALL {",
        "  take:",
        "  files",
        "  main:",
        "  COUNT(files)",
        "  emit:",
        "  counts = COUNT.out.n",
        "}",
        "workflow {",
        "  COUNT_ALL(channel.fromPath('*.txt'))",
        "}",
      ].join("\n"),
    });
    // The argument's channel code is a channel operator feeding it.
    expect(draft.nodes.map((node) => node.data.label).sort()).toEqual(["COUNT_ALL", "ch_count_all_files"]);
    const step = byLabel(draft.nodes, "COUNT_ALL");
    const source = String((step?.data.customNodeDefinition as { source?: string } | undefined)?.source);
    expect(source).toContain("process COUNT {");
    expect(source).toContain("workflow COUNT_ALL {");
    expect(step?.data.outputs?.map((port) => port.name)).toEqual(["counts"]);
  });
});

// Code the canvas has no steps for: kept as written, in its place.
const WITH_EXTRAS = `#!/usr/bin/env nextflow
nextflow.enable.dsl = 2
nextflow.preview.output = true

params.input = "\${projectDir}/data/*.txt"
params.skip = null
params.lines = 5

include { validateParameters } from 'plugin/nf-schema'

def banner(name) {
  return "== \${name} =="
}

process COUNT {
  input:
  path text
  output:
  path 'n.txt', emit: n
  script:
  """
  wc -l \${text} > n.txt
  """
}

workflow {
  main:
  ch_text = channel.fromPath(params.input)

  // Count the lines of each file.
  COUNT(ch_text)
  counts = COUNT.out.n.collect()

  publish:
  counts = counts
}

output {
  counts {
    path 'counts'
  }
}

workflow.onComplete {
  log.info banner('done')
}
`;

describe("importing code the canvas has no steps for", () => {
  const codeOf = (nodes: Node<NodeData>[], placement: string) =>
    nodes.find((node) => node.data.placement === placement)?.data.channelOperatorCode;

  it("keeps it as written in code nodes that say where it goes", async () => {
    const draft = await importNextflowWorkflow({ rawSource: WITH_EXTRAS });
    expect(codeOf(draft.nodes, "script")).toBe(
      [
        "nextflow.preview.output = true",
        'params.input = "${projectDir}/data/*.txt"\nparams.skip = null',
        "include { validateParameters } from 'plugin/nf-schema'",
        'def banner(name) {\n  return "== ${name} =="\n}',
      ].join("\n\n"),
    );
    expect(codeOf(draft.nodes, "publish")).toBe("counts = counts");
    expect(codeOf(draft.nodes, "end")).toBe("output {\n  counts {\n    path 'counts'\n  }\n}\n\nworkflow.onComplete {\n  log.info banner('done')\n}");
    // Only plain values are parameters.
    expect(draft.nodes.find((node) => node.type === "parameters")?.data.parameters).toEqual([{ name: "lines", type: "number", value: "5" }]);
    // The channel publish: reads stays a named output.
    const counts = draft.nodes.find((node) => node.data.channelOperatorCode === "output.counts = input.count_n.collect()");
    expect(counts?.data.outputs?.map((port) => port.name)).toEqual(["counts"]);
    expect(draft.importWarnings).toEqual([]);
  });

  it("writes it back in place, with the comments above steps", async () => {
    const draft = await importNextflowWorkflow({ rawSource: WITH_EXTRAS });
    const script = generateNextflowScript(draft.nodes, draft.edges, draft.name, "results", "{workflow_name}");
    expect(script).not.toContain("#!/usr/bin/env nextflow");
    expect(script).not.toContain("enable.dsl");
    const at = (text: string) => {
      const index = script.indexOf(text);
      expect(index, text).toBeGreaterThan(-1);
      return index;
    };
    expect(at("include { validateParameters }")).toBeLessThan(at("process COUNT"));
    expect(at("def banner(name)")).toBeLessThan(at("workflow {"));
    expect(script).toContain("workflow {\n    main:\n");
    expect(script).toContain("    // Count the lines of each file.\n    COUNT(ch_text)\n");
    expect(script).toContain("\n    publish:\n    counts = counts\n}\n");
    expect(at("output {")).toBeGreaterThan(at("publish:"));
    expect(at("workflow.onComplete {")).toBeGreaterThan(at("output {"));

    // And the same again after another round.
    const again = await importNextflowWorkflow({ rawSource: script });
    expect(generateNextflowScript(again.nodes, again.edges, again.name, "results", "{workflow_name}")).toBe(script);
  });

  it("keeps steps without inputs or outputs, and unnamed outputs by position", async () => {
    const draft = await importNextflowWorkflow({
      rawSource: [
        "process HELLO {",
        "  output: path 'a.txt'",
        "  stdout",
        "  script:",
        "  'echo hi > a.txt'",
        "}",
        "process BYE {",
        "  input: val word",
        "  script:",
        "  \"echo $word\"",
        "}",
        "workflow {",
        "  HELLO()",
        "  HELLO.out[1].view()",
        "  BYE('bye')",
        "}",
      ].join("\n"),
    });
    const script = generateNextflowScript(draft.nodes, draft.edges, draft.name, "results", "{workflow_name}");
    expect(script).toContain("    HELLO()\n");
    expect(script).toContain("    HELLO.out[1].view()\n");
    expect(script).toContain("    BYE('bye')\n");
  });

  it("keeps calls to what it can't read as code, with the include", async () => {
    const draft = await importNextflowWorkflow({
      rawSource: "include { TOOL as T } from './modules/local/tool'\nworkflow {\n  T(channel.of(1))\n}",
    });
    expect(codeOf(draft.nodes, "script")).toBe("include { TOOL as T } from './modules/local/tool'");
    expect(draft.nodes.some((node) => node.data.channelOperatorCode === "T(channel.of(1))")).toBe(true);
    const script = generateNextflowScript(draft.nodes, draft.edges, draft.name, "results", "{workflow_name}");
    expect(script).toContain("include { TOOL as T } from './modules/local/tool'");
    expect(script).toContain("    T(channel.of(1))");
  });
});

describe("importing a script N-WAVE wrote", () => {
  it("keeps each File Input's files", async () => {
    const input = (id: string, label: string, names: string[]) =>
      ({
        ...makeNode("fileInput", { label, files: names.map((name) => ({ name, content: "x", size: 1 })) }),
        id,
      }) as Node<NodeData>;
    const merge = { ...makeNode("merge"), id: "merge" } as Node<NodeData>;
    const edges: Edge[] = ["reads", "notes"].map((id) => ({
      id: `${id}-merge`,
      source: id,
      sourceHandle: "ch_files_out",
      target: "merge",
      targetHandle: "in",
    }));
    const script = generateNextflowScript(
      [input("reads", "Reads", ["a.txt", "b.txt"]), input("notes", "Notes", ["c.txt"]), merge],
      edges,
      "wf",
      "results",
      "{workflow_name}",
    );
    expect(script).toContain("params.reads = ['a.txt', 'b.txt']");

    const imported = await importNextflowWorkflow({ rawSource: script });
    const fileInputs = imported.nodes.filter((node) => node.type === "fileInput");
    expect(Object.fromEntries(fileInputs.map((node) => [node.data.label, (node.data.files ?? []).map((file: { name: string }) => file.name)]))).toEqual({
      Reads: ["a.txt", "b.txt"],
      Notes: ["c.txt"],
    });
    // Both feed the merge; their contents need uploading again.
    const mergeNode = imported.nodes.find((node) => node.type === "operator");
    expect(imported.edges.filter((edge) => edge.target === mergeNode?.id).map((edge) => edge.source).sort()).toEqual(
      fileInputs.map((node) => node.id).sort(),
    );
    expect(fileInputs[0].data.subtitle).toMatch(/upload again/);
  });

  it("gives N-WAVE's steps back with their settings", async () => {
    const input = { ...makeNode("fileInput", { files: [{ name: "a.txt", content: "x", size: 1 }] }), id: "in" } as Node<NodeData>;
    const filter = {
      ...makeNode("filter", { label: "Keep errors", filterText: "ERR|WARN", filterMode: "regex", filterNegate: true }),
      id: "filter",
      position: { x: 300, y: 40 },
    } as Node<NodeData>;
    const map = {
      ...makeNode("map", { label: "Rename", mapOperation: "replaceText", mapReplaceFind: "a/b", mapReplaceWith: "it's & more" }),
      id: "map",
      position: { x: 600, y: 40 },
    } as Node<NodeData>;
    const script = generateNextflowScript(
      [input, filter, map],
      [
        { id: "e1", source: "in", sourceHandle: "out", target: "filter", targetHandle: "in" },
        { id: "e2", source: "filter", sourceHandle: "out", target: "map", targetHandle: "in" },
      ],
      "wf",
      "results",
      "{workflow_name}",
    );
    const imported = await importNextflowWorkflow({ rawSource: script });
    expect(byLabel(imported.nodes, "Keep errors")).toMatchObject({
      type: "operator",
      position: { x: 300, y: 40 },
      data: { operatorType: "filter", filterText: "ERR|WARN", filterMode: "regex", filterNegate: true },
    });
    expect(byLabel(imported.nodes, "Rename")?.data).toMatchObject({
      operatorType: "map",
      mapOperation: "replaceText",
      mapReplaceFind: "a/b",
      mapReplaceWith: "it's & more",
    });
  });

  it("keeps a step whose code was changed by hand as a custom process", async () => {
    const input = { ...makeNode("fileInput", { files: [{ name: "a.txt", content: "x", size: 1 }] }), id: "in" } as Node<NodeData>;
    const filter = { ...makeNode("filter", { filterText: "x" }), id: "filter" } as Node<NodeData>;
    const script = generateNextflowScript(
      [input, filter],
      [{ id: "e1", source: "in", sourceHandle: "out", target: "filter", targetHandle: "in" }],
      "wf",
      "results",
      "{workflow_name}",
    ).replace("grep  'x'", "grep -i 'x'");
    const imported = await importNextflowWorkflow({ rawSource: script });
    const step = byLabel(imported.nodes, "Filter");
    expect(step?.type).toBe("process");
    expect(String((step?.data.customNodeDefinition as { source?: string } | undefined)?.source)).toContain("grep -i 'x'");
  });
});

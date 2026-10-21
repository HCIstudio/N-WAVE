import { describe, it, expect } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { makeNode } from "../test/nodes";
import { importNextflowWorkflow } from "./importNextflowWorkflow";

const SAMPLE_SCRIPT = `
params.inputdir = "./inputs"
params.selected_files = ['sample.txt']

ch_files = Channel.fromList(params.selected_files)

process filter_node_1 {
  input:
  path input_file
  script:
  """
  grep "Barry" \${input_file} > out.txt
  """
}

process map_node_1 {
  input:
  path input_file
  script:
  """
  cat \${input_file} | tr '[:lower:]' '[:upper:]' > out.txt
  """
}

process outputDisplay_node_1 {
  input:
  path input_files
  script:
  """
  cat $input_files > result.txt
  """
}

workflow {
  filtered = filter_node_1(ch_files)
  mapped = map_node_1(filtered)
  outputDisplay_node_1(mapped)
}
`;

describe("importNextflowWorkflow", () => {
  it("throws when the source is empty", () => {
    expect(() => importNextflowWorkflow({ rawSource: "   " })).toThrow(
      /required/i
    );
  });

  it("parses processes into typed visual nodes", () => {
    const draft = importNextflowWorkflow({ rawSource: SAMPLE_SCRIPT });

    const types = draft.nodes.map((n) => n.type);
    expect(types).toContain("fileInput");
    expect(types).toContain("operator"); // filter + map
    expect(types).toContain("outputDisplay");

    const filter = draft.nodes.find((n) => n.data.operatorType === "filter");
    expect(filter?.data.filterText).toBe("Barry");

    const map = draft.nodes.find((n) => n.data.operatorType === "map");
    expect(map).toBeTruthy();
  });

  it("infers edges from the workflow block", () => {
    const draft = importNextflowWorkflow({ rawSource: SAMPLE_SCRIPT });
    expect(draft.edges.length).toBeGreaterThan(0);
    // every edge references real nodes
    const ids = new Set(draft.nodes.map((n) => n.id));
    for (const edge of draft.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("marks the import as an editable, imported Nextflow workflow", () => {
    const draft = importNextflowWorkflow({
      name: "  My Pipe  ",
      rawSource: SAMPLE_SCRIPT,
      sourceKey: "pipe.nf",
    });
    expect(draft.name).toBe("My Pipe");
    expect(draft.originType).toBe("imported");
    expect(draft.sourceFormat).toBe("nextflow");
    expect(draft.isReadOnly).toBe(false);
    expect(draft.rawSource).toContain("workflow {");
  });

  it("warns when there are no processes to visualize", () => {
    const draft = importNextflowWorkflow({
      rawSource: "workflow { }",
    });
    expect(draft.importWarnings.join(" ")).toMatch(/no nextflow process/i);
  });
});

const proc = (name: string, script: string) => `
process ${name} {
  input:
  path input_file
  script:
  """
  ${script}
  """
}
`;

describe("importNextflowWorkflow node types", () => {
  const nodeFor = (name: string, script: string) =>
    importNextflowWorkflow({ rawSource: proc(name, script) }).nodes.find(
      (node) => node.data.label !== "File Input",
    );

  it("reads sed as a replace-text Map", () => {
    expect(
      nodeFor("rename", "sed 's/a/b/g' ${input_file} > out.txt")?.data,
    ).toMatchObject({
      operatorType: "map",
      mapOperation: "replaceText",
    });
  });

  it("reads tr to lower case as a lowercase Map", () => {
    expect(
      nodeFor(
        "lower",
        "cat ${input_file} | tr '[:upper:]' '[:lower:]' > out.txt",
      )?.data,
    ).toMatchObject({
      operatorType: "map",
      mapOperation: "changeCase",
      mapChangeCase: "toLowerCase",
    });
  });

  it("reads cat of all inputs as a Merge", () => {
    expect(
      nodeFor("combine", "cat $input_files > all.txt")?.data,
    ).toMatchObject({
      operatorType: "merge",
      mergeOperation: "join",
    });
  });

  it("keeps anything else as a generic process", () => {
    const node = nodeFor("ALIGN", "bwa mem ref.fa ${input_file} > out.sam");
    expect(node?.type).toBe("process");
    expect(node?.data).toMatchObject({
      label: "ALIGN",
      subtitle: "Imported process",
    });
  });
});

describe("importNextflowWorkflow names and warnings", () => {
  it("names the workflow after a named workflow, then a process", () => {
    expect(
      importNextflowWorkflow({ rawSource: "workflow MAIN {\n}" }).name,
    ).toBe("MAIN");
    expect(
      importNextflowWorkflow({ rawSource: proc("ONLY", "echo hi") }).name,
    ).toBe("ONLY");
    expect(importNextflowWorkflow({ rawSource: "params.x = 1" }).name).toBe(
      "Imported Nextflow Workflow",
    );
    expect(
      importNextflowWorkflow({
        rawSource: proc("ONLY", "echo hi"),
        name: "  Mine ",
      }).name,
    ).toBe("Mine");
  });

  it("warns without a workflow block or without connections", () => {
    const noWorkflow = importNextflowWorkflow({
      rawSource: proc("A", "echo a"),
    });
    expect(noWorkflow.importWarnings.join(" ")).toMatch(
      /No workflow block was found/,
    );
    const unconnected = importNextflowWorkflow({
      rawSource: `${proc("A", "echo a")}\nworkflow {\n  x = 1\n}`,
    });
    expect(unconnected.importWarnings.join(" ")).toMatch(
      /no workflow connections could be inferred/,
    );
  });

  it("connects calls without an assignment and channels built from other channels", () => {
    const draft = importNextflowWorkflow({
      rawSource: `
params.selected_files = ['a.txt', 'b.txt']
ch_files = Channel.fromList(params.selected_files)
${proc("filter_x", 'grep "a" ${input_file} > out.txt')}
${proc("ALIGN", "bwa mem ${input_file}")}
workflow {
  picked = ch_files.map { it }
  filtered = filter_x(picked)
  ALIGN(filtered)
}`,
    });
    const input = draft.nodes.find((node) => node.data.label === "File Input");
    expect(input?.data.subtitle).toBe("2 imported file references");
    const align = draft.nodes.find((node) => node.data.label === "ALIGN");
    const filter = draft.nodes.find(
      (node) => node.data.operatorType === "filter",
    );
    expect(draft.edges.map((edge) => [edge.source, edge.target])).toEqual([
      [input?.id, filter?.id],
      [filter?.id, align?.id],
    ]);
  });
});

describe("importing a script with several File Inputs", () => {
  it("keeps each File Input's files", () => {
    const input = (id: string, names: string[]) =>
      ({
        ...makeNode("fileInput", { files: names.map((name) => ({ name, content: "x", size: 1 })) }),
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
      [input("reads", ["a.txt", "b.txt"]), input("notes", ["c.txt"]), merge],
      edges,
      "wf",
      "results",
      "{workflow_name}",
    );
    expect(script).toContain("params.selected_files_reads = ['a.txt', 'b.txt']");

    const imported = importNextflowWorkflow({ rawSource: script });
    const fileInputs = imported.nodes.filter((node) => node.type === "fileInput");
    expect(fileInputs.map((node) => (node.data.files ?? []).map((file: { name: string }) => file.name))).toEqual([
      ["a.txt", "b.txt"],
      ["c.txt"],
    ]);
    // Both feed the merge.
    const mergeNode = imported.nodes.find((node) => node.type === "operator");
    expect(
      imported.edges.filter((edge) => edge.target === mergeNode?.id).map((edge) => edge.source).sort(),
    ).toEqual(fileInputs.map((node) => node.id).sort());
  });
});


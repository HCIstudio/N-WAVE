import { describe, it, expect } from "vitest";
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
  cat \$input_files > result.txt
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

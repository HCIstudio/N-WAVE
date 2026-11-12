import { describe, expect, it } from "vitest";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { importNextflowScript } from "../workflows/import/importScript";

const SCRIPT = `params.aligner = 'star'

process TRIM {
    output:
    path 'trimmed.txt'

    script:
    """
    echo 'ACGT' > trimmed.txt
    """
}

process QC {
    input:
    path reads

    output:
    path 'qc.txt'

    script:
    """
    wc -c < \${reads} > qc.txt
    """
}

process ALIGN_STAR {
    input:
    path reads

    output:
    path 'aligned.txt'

    script:
    """
    echo 'star' > aligned.txt
    """
}

process ALIGN_HISAT {
    input:
    path reads

    output:
    path 'aligned.txt'

    script:
    """
    echo 'hisat2' > aligned.txt
    """
}

process REPORT {
    input:
    path aligned
    path qc

    output:
    path 'report.txt'

    script:
    """
    cat \${aligned} \${qc} > report.txt
    """
}

workflow {
    TRIM()
    QC(TRIM.out)
    ch_aligned = channel.empty()
    if (params.aligner == 'star') {
        ALIGN_STAR(TRIM.out)
        ch_aligned = ALIGN_STAR.out
    } else {
        ALIGN_HISAT(TRIM.out)
        ch_aligned = ALIGN_HISAT.out
    }
    REPORT(ch_aligned, QC.out)
}
`;

const ALIGN_ONLY = SCRIPT.replace(
  /workflow \{[\s\S]*$/,
  `workflow {
    TRIM()
    if (params.aligner == 'star') {
        ALIGN_STAR(TRIM.out)
    }
}
`,
);

const workflowBlock = (script: string) =>
  script.slice(script.indexOf("workflow {"), script.indexOf("\n// N-WAVE layout"));

describe("an if/else block, imported", () => {
  const imported = importNextflowScript(SCRIPT);
  const byId = (id: string) => imported.nodes.find((node) => node.id === id);

  it("is a Branch node, with each arm's steps in it, connected as the code reads", () => {
    expect(imported.warnings).toEqual([]);
    const branch = imported.nodes.find((node) => node.type === "branch");
    expect(branch?.data.condition).toBe("params.aligner == 'star'");
    expect(byId("n-align_star")?.data.branch).toEqual({ id: branch?.id, arm: "if" });
    expect(byId("n-align_hisat")?.data.branch).toEqual({ id: branch?.id, arm: "else" });
    expect(byId("n-report")?.data.branch).toBeUndefined();
    // No code kept as written, and no step only defined.
    expect(imported.nodes.filter((node) => node.type === "channelOperator")).toEqual([]);
    expect(imported.nodes.filter((node) => node.data.definitionOnly)).toEqual([]);
    const edges = imported.edges.map(
      (edge) => `${edge.source}.${edge.sourceHandle}->${edge.target}.${edge.targetHandle}`,
    );
    expect(edges).toEqual(
      expect.arrayContaining([
        "n-trim.out->n-align_star.reads",
        "n-trim.out->n-align_hisat.reads",
        // Where the arms meet: the report reads whichever aligner ran.
        "n-align_star.out->n-report.aligned",
        "n-align_hisat.out->n-report.aligned",
        "n-qc.out->n-report.qc",
      ]),
    );
    // The aligner stays a parameter.
    expect(byId("n-params")?.data.parameters).toEqual([{ name: "aligner", type: "text", value: "star" }]);
  });

  it("is written back as the if/else block, with the channel either arm sets", () => {
    const script = generateNextflowScript(imported.nodes, imported.edges, "Two aligners", "results");
    expect(workflowBlock(script)).toContain(`    ch_aligned = channel.empty()
    if (params.aligner == 'star') {
        ALIGN_STAR(TRIM.out)
        ch_aligned = ALIGN_STAR.out
    } else {
        ALIGN_HISAT(TRIM.out)
        ch_aligned = ALIGN_HISAT.out
    }`);
    expect(workflowBlock(script)).toContain("REPORT(ch_aligned, QC.out)");
  });

  it("comes back the same after an export and an import", () => {
    const first = generateNextflowScript(imported.nodes, imported.edges, "Two aligners", "results");
    const again = importNextflowScript(first);
    expect(again.warnings).toEqual([]);
    expect(generateNextflowScript(again.nodes, again.edges, "Two aligners", "results")).toBe(first);
  });

  it("keeps an if without else, and its steps only it calls", () => {
    const only = importNextflowScript(ALIGN_ONLY);
    expect(only.nodes.find((node) => node.id === "n-align_star")?.data.branch).toMatchObject({ arm: "if" });
    const script = generateNextflowScript(only.nodes, only.edges, "One aligner", "results");
    expect(workflowBlock(script)).toContain(`    if (params.aligner == 'star') {
        ALIGN_STAR(TRIM.out)
    }`);
    expect(workflowBlock(script)).not.toContain("else");
  });

  it("stays code when an arm does more than call steps", () => {
    const other = importNextflowScript(
      SCRIPT.replace("ch_aligned = ALIGN_HISAT.out", "ch_aligned = ALIGN_HISAT.out.map { it }"),
    );
    expect(other.nodes.some((node) => node.type === "branch")).toBe(false);
  });
});

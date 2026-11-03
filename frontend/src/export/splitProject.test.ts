import { describe, expect, it } from "vitest";
import { splitProject } from "./splitProject";

const SCRIPT = `params.outdir = 'results'

include { FASTQC } from './modules/nf-core/fastqc/main'
include { validateParameters } from 'plugin/nf-schema'

def label(name) {
  return name.toUpperCase()
}

// Count the lines.
process COUNT {
  input: path x
  output: path 'n.txt'
  script:
  "wc -l < \${x} > n.txt"
}

process NAMED {
  input: val name
  script:
  "echo \${label(name)}"
}

//
// QC and counting.
//

workflow QC_AND_COUNT {
  take:
  reads
  main:
  FASTQC(reads)
  reads | COUNT
}

workflow {
  validateParameters()
  QC_AND_COUNT(channel.fromPath('*.fq'))
  NAMED('x')
}
`;

describe("splitProject", () => {
  const { main, files } = splitProject(SCRIPT);

  it("moves processes and named workflows to their own files, with their comments", () => {
    expect(Object.keys(files).sort()).toEqual(["modules/local/count/main.nf", "subworkflows/local/qc_and_count/main.nf"]);
    expect(files["modules/local/count/main.nf"]).toBe("// Count the lines.\nprocess COUNT {\n  input: path x\n  output: path 'n.txt'\n  script:\n  \"wc -l < ${x} > n.txt\"\n}\n");
    expect(files["subworkflows/local/qc_and_count/main.nf"]).toMatch(/^include \{ COUNT \} from '\.\.\/\.\.\/\.\.\/modules\/local\/count'\ninclude \{ FASTQC \} from '\.\.\/\.\.\/\.\.\/modules\/nf-core\/fastqc\/main'\n\n\/\/\n\/\/ QC and counting\.\n\/\/\n\nworkflow QC_AND_COUNT \{/);
  });

  it("keeps code that calls main.nf's functions, and includes what moved", () => {
    expect(main).toContain("process NAMED {");
    expect(main).toContain("include { QC_AND_COUNT } from './subworkflows/local/qc_and_count'");
    expect(main).not.toContain("include { COUNT }");
    expect(main).not.toContain("process COUNT");
    expect(main).not.toContain("QC and counting");
    // FASTQC went with the workflow that uses it; the plugin stays.
    expect(main).not.toContain("include { FASTQC }");
    expect(main).toContain("include { validateParameters } from 'plugin/nf-schema'");
  });

  it("leaves a script with nothing to move as it is", () => {
    const script = "workflow {\n  channel.of(1).view()\n}\n";
    expect(splitProject(script)).toEqual({ main: script, files: {} });
  });
});

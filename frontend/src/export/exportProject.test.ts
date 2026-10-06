import { strFromU8, unzipSync } from "fflate";
import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
// Load the registry first, as the app does (api/nfcore imports the adapters).
import "../registry/nodeDefinitions";
import {
  buildProjectFiles,
  extractNextflowConfig,
  getReferencedNfCoreModules,
  getReferencedNfCoreSubworkflows,
  toProjectName,
  zipProject,
} from "./exportProject";
import { collectInputFiles } from "./exportWorkflow";

const script = `// Workflow Script for qc
nextflow.enable.dsl = 2

params.outdir = 'results'
params.inputdir = "./inputs"

include { FASTQC as FASTQC_N1 } from './modules/nf-core/fastqc/main'
include { MULTIQC as MULTIQC_N2 } from './modules/nf-core/multiqc/main'

/* N-WAVE_NEXTFLOW_CONFIG
process {
  withName: 'FASTQC_N1' {
    ext.args = '--quiet'
  }
}
*/

workflow {
    FASTQC_N1(ch_reads)
}
`;

const moduleFiles = {
  fastqc: { "main.nf": "process FASTQC {}", "meta.yml": "name: fastqc" },
  multiqc: {
    "main.nf": "process MULTIQC {}",
    "templates/report.py": "print()",
    "../escape.txt": "x",
  },
};

describe("extractNextflowConfig", () => {
  it("moves the embedded config out of the script", () => {
    const { script: cleaned, config } = extractNextflowConfig(script);
    expect(cleaned).not.toContain("N-WAVE_NEXTFLOW_CONFIG");
    expect(cleaned).toContain("workflow {");
    expect(config).toBe(
      "process {\n  withName: 'FASTQC_N1' {\n    ext.args = '--quiet'\n  }\n}",
    );
  });
});

describe("getReferencedNfCoreModules", () => {
  it("lists included modules by path", () => {
    expect(getReferencedNfCoreModules(script)).toEqual(["fastqc", "multiqc"]);
    expect(
      getReferencedNfCoreModules(
        "include { X } from './modules/nf-core/star/align/main'\ninclude { Y } from './modules/nf-core/../etc/main'",
      ),
    ).toEqual(["star/align"]);
  });
});

describe("buildProjectFiles", () => {
  const files = buildProjectFiles({
    workflowName: "QC run",
    script,
    inputFiles: [
      { name: "sample.txt", content: "hello" },
      { name: "reads.fastq.gz" },
    ],
    moduleFiles,
  });

  it("contains the script, config, modules, inputs and README", () => {
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "inputs/sample.txt",
      "main.nf",
      "modules/nf-core/fastqc/main.nf",
      "modules/nf-core/fastqc/meta.yml",
      "modules/nf-core/multiqc/main.nf",
      "modules/nf-core/multiqc/templates/report.py",
      "nextflow.config",
    ]);
    expect(files["main.nf"]).toContain(
      "include { FASTQC as FASTQC_N1 } from './modules/nf-core/fastqc/main'",
    );
    expect(files["inputs/sample.txt"]).toBe("hello");
  });

  it("writes the module config and a docker profile", () => {
    const config = files["nextflow.config"];
    expect(config).toContain("withName: 'FASTQC_N1'");
    expect(config).toContain('inputdir = "${projectDir}/inputs"');
    expect(config).toMatch(
      /profiles \{\n {2}docker \{\n {4}docker\.enabled = true/,
    );
    expect(config).toContain("docker.runOptions = '-u $(id -u):$(id -g)'");
  });

  it("explains how to run it and which inputs are missing", () => {
    const readme = files["README.md"];
    expect(readme).toContain("cd QC_run\nnextflow run main.nf -profile docker");
    expect(readme).toContain("`inputs/sample.txt` (included)");
    expect(readme).toContain(
      "`inputs/reads.fastq.gz`: **not included**, add this file before running",
    );
    expect(readme).toContain("  - `fastqc`\n  - `multiqc`");
  });

  it("fails when a module's files are missing", () => {
    expect(() =>
      buildProjectFiles({
        workflowName: "x",
        script,
        inputFiles: [],
        moduleFiles: { fastqc: moduleFiles.fastqc },
      }),
    ).toThrow("Missing files for nf-core module multiqc.");
  });

  it("ignores file names with path separators", () => {
    const unsafe = buildProjectFiles({
      workflowName: "x",
      script: "workflow {}",
      inputFiles: [{ name: "../evil.txt", content: "x" }],
      moduleFiles: {},
    });
    expect(Object.keys(unsafe).some((path) => path.includes(".."))).toBe(false);
  });
});

describe("projects with nf-core subworkflows", () => {
  const subworkflowScript = `include { BAM_SORT_STATS_SAMTOOLS as SORT_N1 } from './subworkflows/nf-core/bam_sort_stats_samtools/main'
include { FASTQC as FASTQC_N2 } from './modules/nf-core/fastqc/main'

workflow {
    SORT_N1(ch_bam, Channel.value([[:], [], []]))
}
`;
  const subworkflowFiles = {
    bam_sort_stats_samtools: {
      "main.nf": [
        "include { SAMTOOLS_SORT } from '../../../modules/nf-core/samtools/sort/main'",
        "include { BAM_STATS_SAMTOOLS } from '../bam_stats_samtools/main'",
        "workflow BAM_SORT_STATS_SAMTOOLS {}",
      ].join("\n"),
      "nextflow.config": "process {}",
    },
    bam_stats_samtools: {
      "main.nf":
        "include { SAMTOOLS_STATS } from '../../../modules/nf-core/samtools/stats'\nworkflow BAM_STATS_SAMTOOLS {}",
    },
  };
  const modules = {
    fastqc: { "main.nf": "process FASTQC {}" },
    "samtools/sort": { "main.nf": "process SAMTOOLS_SORT {}" },
    "samtools/stats": { "main.nf": "process SAMTOOLS_STATS {}" },
  };

  it("lists the subworkflows a script includes", () => {
    expect(getReferencedNfCoreSubworkflows(subworkflowScript)).toEqual([
      "bam_sort_stats_samtools",
    ]);
  });

  it("adds the subworkflows and every module they include", () => {
    const files = buildProjectFiles({
      workflowName: "sort",
      script: subworkflowScript,
      inputFiles: [],
      moduleFiles: modules,
      subworkflowFiles,
    });
    expect(
      Object.keys(files)
        .filter((name) => /^(modules|subworkflows)\//.test(name))
        .sort(),
    ).toEqual([
      "modules/nf-core/fastqc/main.nf",
      "modules/nf-core/samtools/sort/main.nf",
      "modules/nf-core/samtools/stats/main.nf",
      "subworkflows/nf-core/bam_sort_stats_samtools/main.nf",
      "subworkflows/nf-core/bam_sort_stats_samtools/nextflow.config",
      "subworkflows/nf-core/bam_stats_samtools/main.nf",
    ]);
    expect(files["README.md"]).toContain("  - `bam_stats_samtools`");
  });

  it("fails when a subworkflow's or an included module's files are missing", () => {
    expect(() =>
      buildProjectFiles({
        workflowName: "sort",
        script: subworkflowScript,
        inputFiles: [],
        moduleFiles: modules,
        subworkflowFiles: {
          bam_sort_stats_samtools: subworkflowFiles.bam_sort_stats_samtools,
        },
      }),
    ).toThrow("Missing files for nf-core subworkflow bam_stats_samtools.");
    expect(() =>
      buildProjectFiles({
        workflowName: "sort",
        script: subworkflowScript,
        inputFiles: [],
        moduleFiles: { fastqc: modules.fastqc },
        subworkflowFiles,
      }),
    ).toThrow("Missing files for nf-core module samtools/sort.");
  });
});

describe("zipProject", () => {
  it("puts every file in a folder named after the workflow", async () => {
    const blob = await zipProject("QC run", {
      "main.nf": "workflow {}",
      "inputs/a.txt": "a",
    });
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([
      "QC_run/inputs/a.txt",
      "QC_run/main.nf",
    ]);
    expect(strFromU8(entries["QC_run/main.nf"])).toBe("workflow {}");
  });

  it("names projects safely", () => {
    expect(toProjectName("  My  workflow / v2 ")).toBe("My_workflow_v2");
    expect(toProjectName("")).toBe("workflow");
  });
});

describe("collectInputFiles", () => {
  it("collects File Input files, preferring ones with content", () => {
    const node = (id: string, files: unknown[]) =>
      ({
        id,
        type: "fileInput",
        position: { x: 0, y: 0 },
        data: { files },
      }) as unknown as Node<NodeData>;
    expect(
      collectInputFiles([
        node("a", [{ name: "s.txt" }, { name: "t.txt", content: "t" }]),
        node("b", [{ name: "s.txt", content: "s" }]),
      ]),
    ).toEqual([
      { name: "s.txt", content: "s" },
      { name: "t.txt", content: "t" },
    ]);
  });
});

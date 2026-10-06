import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExecutionConfig,
  extractNwaveNextflowAssets,
  getReferencedNfCoreModules,
  normalizeLegacyGeneratedScript,
  stabilizeWorkflowInvocations,
} from "./nextflowScript";

const lines = (...parts: string[]): string => parts.join("\n");

describe("buildExecutionConfig", () => {
  it("returns the generated config unchanged without Docker", () => {
    expect(buildExecutionConfig("  params.x = 1  ", false)).toBe("params.x = 1");
  });

  it("appends a docker block when Docker is enabled", () => {
    const config = buildExecutionConfig("params.x = 1", true);
    expect(config.startsWith("params.x = 1\n\ndocker {")).toBe(true);
    expect(config).toContain("enabled = true");
    expect(config).toContain("executor = 'local'");
  });

  it("is empty when there is nothing to configure", () => {
    expect(buildExecutionConfig("   ", false)).toBe("");
  });
});

describe("extractNwaveNextflowAssets", () => {
  it("moves embedded N-WAVE config blocks out of the script", () => {
    const { script, config } = extractNwaveNextflowAssets(
      lines(
        "/* N-WAVE_NEXTFLOW_CONFIG",
        "process { withName: 'A' { cpus = 2 } }",
        "*/",
        "workflow { A() }",
        "/* N-WAVE_NEXTFLOW_CONFIG params.y = 3 */"
      )
    );
    expect(script).not.toContain("N-WAVE_NEXTFLOW_CONFIG");
    expect(script).toContain("workflow { A() }");
    expect(config).toBe(
      "process { withName: 'A' { cpus = 2 } }\n\nparams.y = 3"
    );
  });

  it("leaves scripts without config blocks alone", () => {
    expect(extractNwaveNextflowAssets("workflow {}")).toEqual({
      script: "workflow {}",
      config: "",
    });
  });
});

describe("getReferencedNfCoreModules", () => {
  it("collects unique nf-core module includes", () => {
    expect(
      getReferencedNfCoreModules(
        lines(
          "include { FASTQC } from './modules/nf-core/fastqc/main'",
          "include { FASTQC as FASTQC2 } from './modules/nf-core/fastqc/main'",
          'include { SAMTOOLS_SORT } from "./modules/nf-core/samtools/sort/main"'
        )
      )
    ).toEqual(["fastqc", "samtools/sort"]);
  });

  it("ignores non nf-core includes", () => {
    expect(
      getReferencedNfCoreModules("include { X } from './modules/local/x/main'")
    ).toEqual([]);
  });
});

describe("normalizeLegacyGeneratedScript", () => {
  it("rejects legacy inline FastQC/Trimmomatic templates", () => {
    expect(() =>
      normalizeLegacyGeneratedScript("echo 'Downloading FastQC'")
    ).toThrow(/legacy inline FastQC\/Trimmomatic template/);
  });

  it("aliases legacy *_ch_files_out references to ch_files", () => {
    const script = lines(
      "ch_files = Channel.fromPath('inputs/*')",
      "",
      "workflow {",
      "  PROC(node_1_ch_files_out)",
      "}"
    );
    const normalized = normalizeLegacyGeneratedScript(script);
    expect(normalized).toContain("node_1_ch_files_out = ch_files\n\nworkflow {");
  });

  it("aliases prefixed tuple outputs to their legacy node_<n> names", () => {
    const script = lines(
      "workflow {",
      "  (abc_node_2_out, abc_node_2_log) = PROC(x)",
      "  node_2_out.view()",
      "}"
    );
    expect(normalizeLegacyGeneratedScript(script)).toContain(
      "(abc_node_2_out, abc_node_2_log) = PROC(x)\n    node_2_out = abc_node_2_out"
    );
  });

  it("does not touch scripts that need no aliases", () => {
    const script = "workflow {\n  A()\n}";
    expect(normalizeLegacyGeneratedScript(script)).toBe(script);
  });
});

describe("stabilizeWorkflowInvocations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orders invocations so producers run before consumers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const script = lines(
      "ch_files = Channel.fromPath('inputs/*')",
      "",
      "workflow {",
      "    node_3_out = PROC_B(node_2_out)",
      "    // comment",
      "    node_2_out = PROC_A(ch_files)",
      "    node_4_out = PROC_C(node_3_out)",
      "}"
    );
    expect(stabilizeWorkflowInvocations(script)).toBe(
      lines(
        "ch_files = Channel.fromPath('inputs/*')",
        "",
        "workflow {",
        "    // comment",
        "    node_2_out = PROC_A(ch_files)",
        "    node_3_out = PROC_B(node_2_out)",
        "    node_4_out = PROC_C(node_3_out)",
        "}"
      )
    );
  });

  it("drops channel declarations duplicated inside the workflow block", () => {
    const script = lines(
      "workflow {",
      "    ch_extra = Channel.of(1)",
      "        .map { it }",
      "    node_1_out = PROC_A(ch_extra)",
      "}"
    );
    const result = stabilizeWorkflowInvocations(script);
    expect(result).not.toContain("Channel.of");
    expect(result).not.toContain(".map");
    expect(result).toContain("node_1_out = PROC_A(ch_extra)");
  });

  it("warns about (unmangled) variables it cannot resolve", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stabilizeWorkflowInvocations(
      lines("workflow {", "    node_1_out = PROC_A(ch_missing)", "}")
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not resolve workflow variable "ch_missing"')
    );
  });

  it("leaves registry-generated scripts untouched", () => {
    const script = lines(
      "// N-WAVE generator: registry-nfcore-v1",
      "workflow {",
      "    node_3_out = PROC_B(node_2_out)",
      "    node_2_out = PROC_A(ch_files)",
      "}"
    );
    expect(stabilizeWorkflowInvocations(script)).toBe(script);
  });

  it("returns scripts without a workflow block unchanged", () => {
    expect(stabilizeWorkflowInvocations("process A {}")).toBe("process A {}");
  });
});

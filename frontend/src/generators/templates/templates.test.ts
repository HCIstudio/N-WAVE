import { describe, expect, it } from "vitest";
import {
  generateOperatorCode,
  generateOutputCode,
  generateProcessCode,
} from "../core/templateEngine";

const base = { processName: "step_1", cpuCount: 2, memoryAmount: "4.GB" };

describe("Filter template", () => {
  it.each([
    ["contains", "grep  'Bee'"],
    ["startsWith", "grep  '^Bee'"],
    // `\$` so Groovy doesn't read `$'` as a variable.
    ["endsWith", String.raw`grep  'Bee\$'`],
    ["regex", "grep  -E 'Bee'"],
  ])("greps for %s", (filterMode, grep) => {
    const code = generateOperatorCode("filter", {
      ...base,
      filterText: "Bee",
      filterMode,
    });
    expect(code).toContain(grep);
    expect(code).toContain('path "*_filtered.txt"');
  });

  it("inverts the match", () => {
    expect(
      generateOperatorCode("filter", {
        ...base,
        filterText: "Bee",
        filterMode: "contains",
        filterNegate: true,
      }),
    ).toContain("grep -v 'Bee'");
  });

  it("quotes the filter text for the shell and the Groovy script string", () => {
    const code = generateOperatorCode("filter", {
      ...base,
      filterText: String.raw`it's $HOME\d "x"`,
      filterMode: "regex",
    });
    // Groovy turns `\$`, `\\` and `\"` back into `$`, `\` and `"`.
    expect(code).toContain(
      String.raw`grep  -E 'it'\\''s \$HOME\\d \"x\"' `,
    );
    expect(code).toContain(
      String.raw`echo '# Filter: No lines matched regex '\\''it'\\''s \$HOME\\d \"x\"'\\''' >`,
    );
  });

  it("passes the file through without a filter text", () => {
    const code = generateOperatorCode("filter", {
      ...base,
      filterMode: "contains",
    });
    expect(code).toContain(
      'cp ${input_file} "${input_file.baseName}_filtered.txt"',
    );
    expect(code).not.toContain("grep");
  });

  it("uses the process settings", () => {
    const code = generateOperatorCode("filter", {
      ...base,
      containerImage: "alpine:3",
      filterText: "x",
      filterMode: "contains",
    });
    expect(code).toContain("process step_1 {");
    expect(code).toContain("container 'alpine:3'");
    expect(code).toContain("cpus 2");
    expect(code).toContain("memory '4.GB'");
  });
});

describe("Map template", () => {
  it("changes case both ways", () => {
    expect(
      generateOperatorCode("map", { ...base, mapOperation: "changeCase" }),
    ).toContain("tr '[:lower:]' '[:upper:]'");
    expect(
      generateOperatorCode("map", {
        ...base,
        mapOperation: "changeCase",
        mapChangeCase: "toLowerCase",
      }),
    ).toContain("tr '[:upper:]' '[:lower:]'");
  });

  it("replaces text", () => {
    expect(
      generateOperatorCode("map", {
        ...base,
        mapOperation: "replaceText",
        mapReplaceFind: "a",
        mapReplaceWith: "b",
      }),
    ).toContain("sed 's/a/b/g'");
  });

  it("escapes the sed delimiter, & and backslashes in replace text", () => {
    expect(
      generateOperatorCode("map", {
        ...base,
        mapOperation: "replaceText",
        mapReplaceFind: "a/b",
        mapReplaceWith: String.raw`c&d\e's`,
      }),
    ).toContain(String.raw`sed 's/a\\/b/c\\&d\\\\e'\\''s/g' `);
  });

  it("passes the file through for an unknown operation", () => {
    expect(
      generateOperatorCode("map", { ...base, mapOperation: "other" }),
    ).toContain('cp ${input_file} "${input_file.baseName}_mapped.txt"');
  });
});

describe("Merge template", () => {
  it("joins text files", () => {
    const code = generateOperatorCode("merge", base);
    expect(code).toContain("process step_1 {");
    expect(code).not.toContain("merged.fastq");
  });

  it("validates and concatenates FASTQ files", () => {
    const code = generateOperatorCode("merge", {
      ...base,
      outputType: "fastq",
    });
    expect(code).toContain('path "merged.fastq", emit: merged');
    expect(code).toContain("lines not multiple of 4");
  });

  it("rejects an unknown operator", () => {
    expect(() => generateOperatorCode("reduce" as "merge", base)).toThrow(
      "Unknown operator type: reduce",
    );
  });
});

describe("Display Output template", () => {
  const output = {
    ...base,
    processName: "save_out",
    outputLabel: "Result",
    downloadFormat: "txt",
    outputDisplayCounter: 3,
    outputNamingPattern: "{workflow_name}_{date}_{process_name}",
    workflowName: "Flow",
    timestamp: 123,
    date: "2026-10-18",
  };

  it("names the output from the pattern and counter", () => {
    const code = generateOutputCode({ ...output, selectedFileName: "a.txt" });
    expect(code).toContain("Flow_2026-10-18_save_out_03_Result");
    expect(code).toContain('echo "Processing file: ${input_file}"');
  });

  it("collects every file into a manifest for 'all'", () => {
    const code = generateOutputCode({ ...output, selectedFileName: "all" });
    expect(code).toContain(
      'MANIFEST="Flow_2026-10-18_save_out_03_Result_manifest.txt"',
    );
  });

  it("makes a file-name-safe prefix from the workflow name", () => {
    const code = generateOutputCode({
      ...output,
      workflowName: 'My "QC" $run/1',
      selectedFileName: "a.txt",
    });
    expect(code).toContain("My__QC___run_1_2026-10-18_save_out_03_Result");
    expect(code).not.toContain('"QC"');
  });

  it("falls back to the default naming pattern", () => {
    const code = generateOutputCode({
      ...output,
      outputNamingPattern: "",
      selectedFileName: "a.txt",
    });
    expect(code).toContain("Flow_123_save_out_03_Result");
  });
});

describe("Generic process template", () => {
  it("has defaults for the container, time and script", () => {
    const code = generateProcessCode("generic", base);
    expect(code).toContain("container 'ubuntu:22.04'");
    expect(code).toContain("time '1.h'");
    expect(code).toContain('echo "Hello World"');
  });

  it("takes a script, container and time limit", () => {
    const code = generateProcessCode("generic", {
      ...base,
      script: '"""\nwc -l\n"""',
      containerImage: "alpine:3",
      timeLimit: "2.h",
    });
    expect(code).toContain("wc -l");
    expect(code).toContain("container 'alpine:3'");
    expect(code).toContain("time '2.h'");
  });
});

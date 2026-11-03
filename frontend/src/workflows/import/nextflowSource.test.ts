import { describe, expect, it } from "vitest";
import {
  closingBracket,
  definedNames,
  maskSource,
  splitWorkflowStatements,
  topLevelItems,
  usedNames,
  workflowSections,
} from "./nextflowSource";

describe("maskSource", () => {
  it("blanks strings and comments, keeping lines and brackets in code", () => {
    const text = [
      'def x = "a { b ${ y ? "}" : \'{\' } c"   // a } comment',
      "/* { */ def r = ~/\\d+{2}/ ; def s = '''",
      "multi { line",
      "'''",
    ].join("\n");
    const masked = maskSource(text);
    expect(masked).toHaveLength(text.length);
    expect(masked.split("\n")).toHaveLength(4);
    expect(masked.replace(/[^{}]/g, "")).toBe("");
  });

  it("tells division from a slashy string", () => {
    const masked = maskSource("def half = total / 2\ndef pattern = /a{1}/");
    expect(masked).toContain("total / 2");
    expect(masked).not.toContain("{1}");
  });

  it("matches brackets around strings with brackets in them", () => {
    const text = 'process A { script: """ echo "}" """ }';
    const masked = maskSource(text);
    expect(closingBracket(masked, text.indexOf("{"))).toBe(text.length - 1);
  });
});

describe("topLevelItems", () => {
  it("finds every part of a script, with the comments before it", () => {
    const script = [
      "#!/usr/bin/env nextflow",
      "nextflow.enable.dsl = 2",
      "",
      "params.reads = 'data/*_{1,2}.fq.gz' // the reads",
      "params.list = [",
      "  'a',",
      "  'b'",
      "]",
      "",
      "include { FASTQC; MULTIQC as QC } from './modules/nf-core/fastqc/main'",
      "",
      "// Count the lines.",
      "process COUNT {",
      '  input: path x',
      '  script: """',
      "  wc -l $x > out.txt # }",
      '  """',
      "}",
      "",
      "def helper(name) {",
      "  name.toUpperCase()",
      "}",
      "",
      "workflow SUB {",
      "  take: ch",
      "  main: COUNT(ch)",
      "  emit: COUNT.out",
      "}",
      "",
      "workflow {",
      "  SUB(channel.fromPath(params.reads))",
      "}",
      "",
      "workflow.onComplete {",
      "  log.info 'done'",
      "}",
    ].join("\n");
    const items = topLevelItems(script);
    expect(items.map((item) => [item.kind, item.name])).toEqual([
      ["other", ""],
      ["enable", ""],
      ["params", "reads"],
      ["params", "list"],
      ["include", ""],
      ["process", "COUNT"],
      ["function", "helper"],
      ["workflow", "SUB"],
      ["workflow", ""],
      ["other", ""],
    ]);
    expect(items[3].text).toBe("params.list = [\n  'a',\n  'b'\n]");
    expect(items[5].comments).toEqual(["// Count the lines."]);
    expect(items[5].text.endsWith('"""\n}')).toBe(true);
    expect(items[9].text).toBe("workflow.onComplete {\n  log.info 'done'\n}");
  });
});

describe("workflow statements", () => {
  it("splits main: into statements, keeping chains and if/else blocks whole", () => {
    const body = [
      "  take:",
      "  reads",
      "  main:",
      "  // Trim them.",
      "  TRIM(reads)",
      "  ch_out = TRIM.out.reads",
      "      .map { meta, files ->",
      "          [ meta, files ]",
      "      }",
      "  if (params.skip) {",
      "    ch_x = channel.empty()",
      "  } else {",
      "    ch_x = ch_out",
      "  }",
      "  ch_out.view(); ch_x.view()",
      "  emit:",
      "  out = ch_out",
    ].join("\n");
    const sections = workflowSections(body);
    expect(sections.take.trim()).toBe("reads");
    expect(sections.emit.trim()).toBe("out = ch_out");
    const statements = splitWorkflowStatements(sections.main);
    expect(statements.map((statement) => statement.text)).toEqual([
      "TRIM(reads)",
      "ch_out = TRIM.out.reads\n      .map { meta, files ->\n          [ meta, files ]\n      }",
      "if (params.skip) {\n    ch_x = channel.empty()\n  } else {\n    ch_x = ch_out\n  }",
      "ch_out.view()",
      "ch_x.view()",
    ]);
    expect(statements[0].comments).toEqual(["// Trim them."]);
  });

  it("knows what a statement defines and reads", () => {
    expect(definedNames("ch_a = x.map { it }")).toEqual(["ch_a"]);
    expect(definedNames("(a, b) = STEP(x)")).toEqual(["a", "b"]);
    expect(definedNames("x.branch { a: true }.set { split }")).toEqual(["split"]);
    const used = usedNames("ch_b = ch_a.mix(STEP.out.reads, OTHER.out).map { meta, ch_a -> 'ch_a' }", new Set(["ch_a"]));
    expect(used.variables).toEqual(["ch_a"]);
    expect(used.outputs.map((output) => [output.step, output.emit])).toEqual([
      ["STEP", "reads"],
      ["OTHER", null],
    ]);
  });
});

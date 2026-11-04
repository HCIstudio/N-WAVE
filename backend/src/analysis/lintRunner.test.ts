import { describe, expect, it } from "vitest";
import {
  buildLintDockerArgs,
  DEFAULT_LINT_IMAGE,
  encodeProject,
  filesToLint,
  getLintStatus,
  LintUnavailableError,
  parseLintOutput,
  readLintConfig,
  runNextflowLint,
} from "./lintRunner";

describe("parseLintOutput", () => {
  it("reads errors and warnings of the concise output, without colours", () => {
    const output = [
      "Linting Nextflow code..",
      "\u001b[0;31mError\u001b[0;1m main.nf\u001b[m:12:5: \u001b[36m`GOODBYE`\u001b[39m is not defined",
      "Warn  modules/local/x/main.nf:2:7: Variable was declared but not used",
      "Warn  /tmp/project/subworkflows/nf-core/y/main.nf:65:9: Implicit closure parameter is deprecated",
      " ❌ 1 file had 1 error",
    ].join("\n");
    expect(parseLintOutput(output)).toEqual([
      { level: "error", file: "main.nf", line: 12, column: 5, message: "`GOODBYE` is not defined" },
      { level: "warning", file: "modules/local/x/main.nf", line: 2, column: 7, message: "Variable was declared but not used" },
      { level: "warning", file: "subworkflows/nf-core/y/main.nf", line: 65, column: 9, message: "Implicit closure parameter is deprecated" },
    ]);
  });
});

describe("the project sent to the container", () => {
  it("is one line per file: path, tab, base64", () => {
    expect(encodeProject({ "main.nf": "workflow {}\n", "a/b.nf": "é" })).toBe(
      `main.nf\t${Buffer.from("workflow {}\n").toString("base64")}\na/b.nf\t${Buffer.from("é").toString("base64")}\n`
    );
    expect(() => encodeProject({ "a\tb.nf": "" })).toThrow("Not a usable file name");
  });

  it("lints the project's own scripts, main first, not nf-core's", () => {
    const files = { "main.nf": "", "modules/local/a/main.nf": "", "modules/nf-core/fastqc/main.nf": "", "subworkflows/nf-core/x/main.nf": "", "nextflow.config": "" };
    expect(filesToLint({ entry: "main.nf", files })).toEqual(["main.nf", "modules/local/a/main.nf"]);
  });
});

describe("buildLintDockerArgs", () => {
  it("runs lint without network, read-only and without capabilities, with no mounts", () => {
    const args = buildLintDockerArgs("nf:1", "nwave-lint-x", ["main.nf", "it's.nf"]);
    const text = args.join(" ");
    for (const part of ["--network none", "--read-only", "--cap-drop ALL", "--security-opt no-new-privileges", "--pull never", "--memory 2g"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toMatch(/(^| )(-v|--volume|--mount|--volumes-from)( |$)/);
    expect(args.at(-1)).toContain("nextflow lint -o concise 'main.nf' 'it'\\''s.nf'");
  });
});

describe("readLintConfig", () => {
  it("defaults to the pinned image, 120 s, on", () => {
    expect(readLintConfig({})).toEqual({ enabled: true, image: DEFAULT_LINT_IMAGE, timeoutSeconds: 120 });
    expect(readLintConfig({ NWAVE_LINT: "off", NWAVE_LINT_IMAGE: "nf:2", NWAVE_LINT_TIMEOUT: "9" })).toEqual({
      enabled: false,
      image: "nf:2",
      timeoutSeconds: 9,
    });
  });

  it("when off, says why and doesn't run", async () => {
    const off = { enabled: false, image: "nf:1", timeoutSeconds: 1 };
    expect((await getLintStatus(off)).reason).toContain("NWAVE_LINT=off");
    await expect(runNextflowLint({ entry: "main.nf", files: { "main.nf": "" } }, off)).rejects.toBeInstanceOf(LintUnavailableError);
  });
});

// With the image on this machine (LINT_IMAGE_TEST=nextflow/nextflow:25.10.4).
const image = process.env.LINT_IMAGE_TEST;
describe.skipIf(!image)("with Nextflow's image", () => {
  it("finds an error in main.nf and one in an included file, with their lines", async () => {
    const files = {
      "main.nf": "include { A } from './modules/local/a'\n\nworkflow {\n    A()\n    GOODBYE()\n}\n",
      // The process reads a variable it doesn't have.
      "modules/local/a/main.nf": ["process A {", "    script:", `    "echo $${"{"}missing}"`, "}", ""].join("\n"),
    };
    const result = await runNextflowLint({ entry: "main.nf", files }, { enabled: true, image: image ?? "", timeoutSeconds: 300 });
    expect(result.problems).toEqual([
      expect.objectContaining({ level: "error", file: "main.nf", line: 5, message: "`GOODBYE` is not defined" }),
      expect.objectContaining({ level: "error", file: "modules/local/a/main.nf", line: 3 }),
    ]);
  }, 600_000);

  it("finds nothing in clean code", async () => {
    const result = await runNextflowLint(
      { entry: "main.nf", files: { "main.nf": "workflow {\n    channel.of(1).view()\n}\n" } },
      { enabled: true, image: image ?? "", timeoutSeconds: 300 }
    );
    expect(result.problems).toEqual([]);
  }, 600_000);
});

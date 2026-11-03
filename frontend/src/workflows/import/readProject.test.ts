import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildProjectFiles } from "../../export/exportProject";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { importNextflowScript } from "./importScript";
import { readFolder, readProject, readZip } from "./readProject";

const SCRIPT = [
  "process COUNT {",
  "  input: path x",
  "  output: path 'n.txt', emit: n",
  "  script:",
  "  \"wc -l < ${x} > n.txt\"",
  "}",
  "workflow {",
  "  COUNT(channel.fromPath('*.txt'))",
  "  COUNT.out.n.view()",
  "}",
].join("\n");

describe("reading a project to import", () => {
  it("finds main.nf in the project folder, with the other .nf files and nextflow.config", () => {
    const project = readProject({
      "My_Project/main.nf": "workflow {\n}",
      "My_Project/modules/local/count/main.nf": "process COUNT {}",
      "My_Project/nextflow.config": "process { cpus = 2 }",
      "My_Project/README.md": "# Readme",
      "My_Project/inputs/notes.txt": strToU8("Barry"),
      "My_Project/inputs/reads.fq.gz": new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff]),
      "My_Project/work/ab/cd/.command.sh": "x",
    });
    expect(project).toEqual({
      path: "main.nf",
      source: "workflow {\n}",
      files: { "main.nf": "workflow {\n}", "modules/local/count/main.nf": "process COUNT {}", "nextflow.config": "process { cpus = 2 }" },
      config: "process { cpus = 2 }",
      inputs: { "notes.txt": { content: "Barry" }, "reads.fq.gz": { content: "H4sIAP8=", encoding: "base64" } },
    });
  });

  it("takes the top-most script with an entry workflow when there's no main.nf", () => {
    const project = readProject({ "lib/a.nf": "workflow {\n}", "hello.nf": "workflow {\n}", "modules/x.nf": "process X {}" });
    expect(project.path).toBe("hello.nf");
    expect(() => readProject({ "modules/x.nf": "process X {}" })).toThrow(/No Nextflow script with a workflow/);
  });

  it("reads zips and folders", async () => {
    const zip = zipSync({ "P/main.nf": strToU8("workflow {\n}"), "P/data.bin": new Uint8Array([0, 1]) });
    const text = (entries: Record<string, Uint8Array>) =>
      Object.fromEntries(Object.entries(entries).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]));
    expect(text(await readZip(zip))).toEqual({ "P/main.nf": "workflow {\n}" });
    const file = new File(["workflow {\n}"], "main.nf");
    Object.defineProperty(file, "webkitRelativePath", { value: "P/main.nf" });
    expect(text(await readFolder([file, new File(["x"], "notes.txt")]))).toEqual({ "P/main.nf": "workflow {\n}" });
  });

  it("imports an exported project zip as the workflow it came from", async () => {
    const files = buildProjectFiles({ workflowName: "Count", script: SCRIPT, inputFiles: [], moduleFiles: {} });
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [`Count/${path}`, typeof content === "string" ? strToU8(content) : content])));
    const project = readProject(await readZip(zip));
    expect(Object.keys(project.files).sort()).toEqual(["main.nf", "modules/local/count/main.nf", "nextflow.config"]);
    const imported = importNextflowScript(project.source, { files: project.files, path: project.path, config: project.config });
    expect(imported.warnings).toEqual([]);
    const script = generateNextflowScript(imported.nodes, imported.edges, "Count", "results");
    expect(script).toContain("process COUNT {");
    expect(script).toContain("    COUNT(ch_count_x)");
  });

  it("gives File Input nodes their files back from the project's inputs", async () => {
    const script = [
      "params.files = ['notes.txt', 'missing.txt']",
      "params.inputdir = 'inputs'",
      "workflow {",
      "  ch_files = channel.fromList(params.files)",
      "    .map { name -> file(\"${params.inputdir}/${name}\", checkIfExists: true) }",
      "  ch_files.view()",
      "}",
    ].join("\n");
    const zip = zipSync({ "P/main.nf": strToU8(script), "P/inputs/notes.txt": strToU8("Barry") });
    const project = readProject(await readZip(zip));
    const imported = importNextflowScript(project.source, { files: project.files, path: project.path, inputs: project.inputs });
    const input = imported.nodes.find((node) => node.type === "fileInput");
    expect(input?.data.files).toEqual([
      { name: "notes.txt", size: 5, content: "Barry", fileType: "txt" },
      { name: "missing.txt", size: 0, content: "", fileType: "txt" },
    ]);
    // One is missing: still asks for an upload.
    expect(input?.data.subtitle).toBe("2 files (upload again)");
  });
});

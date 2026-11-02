import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { explainFailure, FAILURE_RULES, failedProcessOf } from "./failureExplanations";

// Real Nextflow 25.10 output of runs that failed each way (paths shortened).
const log = (name: string) =>
  readFileSync(join(__dirname, "../test/fixtures/nextflow-failures", `${name}.txt`), "utf8");

describe("explainFailure", () => {
  it.each([
    ["oom", "out-of-memory", "SALMON_INDEX", /exit status 137/],
    ["timelimit", "task-time-limit", "ALIGN_READS", /reached its time limit \(1m\)/],
    // Nextflow 26.04's report of the same, after Docker downloaded its image.
    ["hasnt-exited", "task-time-limit", "NFCORE_AMPLISEQ:AMPLISEQ:DADA2_TAXONOMY_WF:DADA2_TAXONOMY", /reached its time limit, so/],
    ["cnf", "command-not-found", "FASTQC_QC", /runs “fastqc”, which isn't installed on this computer/],
    ["missing", "missing-input", undefined, /“reads_R1\.fastq\.gz” isn't where the workflow looks/],
    ["pull", "container-pull", "SALMON_QUANT", /container image/],
    ["nodocker", "docker-unavailable", "SALMON_INDEX", /Docker isn't running/],
    ["nospace", "no-space", "STAR_INDEX", /no space left on the disk/],
    ["url", "unreachable-url", "CAT_REF", /couldn't download https:\/\/data\.nonexistent-host-nwave\.invalid\/genome\.fa/],
    ["missingout", "missing-output", "TRIM_READS", /“trimmed\.fastq\.gz” wasn't there/],
    // nf-core pipeline runs where GitHub's API and the plugin registry were blocked.
    ["pipeline-github", "pipeline-download", undefined, /GitHub refused/],
    ["plugins", "plugin-download", undefined, /registry\.nextflow\.io/],
  ])("explains %s as %s", (name, kind, process, explanation) => {
    const result = explainFailure(log(name));
    expect(result?.kind).toBe(kind);
    expect(result?.process).toBe(process);
    expect(result?.explanation).toMatch(explanation);
    expect(result?.fix).toBeTruthy();
    expect(result?.docs).toMatch(/^https:\/\/github\.com\/HCIstudio\/N-WAVE\/wiki\/Troubleshooting#[a-z-]+$/);
  });

  it("says when the program was missing from the step's container", () => {
    const inContainer = log("cnf").replace("Work dir:", "Container:\n  ubuntu:22.04\n\nWork dir:");
    const result = explainFailure(inContainer);
    expect(result?.explanation).toContain("isn't installed in its container (ubuntu:22.04)");
    expect(result?.fix).toMatch(/^Use a container image that has the program/);
  });

  it("prefers the backend's resource diagnosis, which knows the run's limits", () => {
    const result = explainFailure(
      `${log("oom")}\nN-WAVE resource problem: A task ran out of memory. Raise Maximum Memory (this run had 2 CPUs and 4 GB).\n`,
    );
    expect(result?.kind).toBe("resource-limits");
    expect(result?.explanation).toContain("this run had 2 CPUs and 4 GB");
  });

  // Each rule says how sure it is and shows the lines it went by.
  it.each([
    ["oom", "likely", /exit status \(137\)/, "Command exit status: 137"],
    ["timelimit", "certain", /exceeded running time limit/, "Command exit status: -"],
    ["hasnt-exited", "likely", /process hasn't exited/, undefined],
    ["cnf", "certain", /fastqc: command not found/, "Command exit status: 127"],
    ["missing", "likely", /No such file or directory/, undefined],
    ["pull", "likely", /failed to resolve reference/, "Command exit status: 125"],
    ["nodocker", "certain", /failed to connect to the docker API/, "Command exit status: 1"],
    ["nospace", "certain", /No space left on device/, "Command exit status: 1"],
    ["url", "likely", /Can't stage file/, "Command exit status: -"],
    ["missingout", "likely", /Missing output file/, "Command exit status: 0"],
    ["pipeline-github", "certain", /Forbidden/, undefined],
    ["plugins", "likely", /Conversion = '4'/, undefined],
  ])("shows the evidence for %s, and is %s", (name, certainty, matched, status) => {
    const text = log(name);
    const lines = text.split("\n");
    const result = explainFailure(text);
    expect(result?.certainty).toBe(certainty);
    const [first, ...rest] = result?.evidence ?? [];
    expect(first.text).toMatch(matched);
    // The line number points at that line of the log.
    expect(lines[first.line].trim()).toBe(first.text);
    expect(rest.map((evidence) => evidence.text)).toEqual(status ? [status] : []);
    for (const evidence of rest) expect(lines[evidence.line].trim()).toBe(status?.split(": ")[1]);
    // A likely cause names what else it could be; a certain one doesn't.
    if (certainty === "likely") expect(result?.alternatives.length).toBeGreaterThan(0);
    else expect(result?.alternatives).toEqual([]);
  });

  it("is sure of running out of memory when the program says so", () => {
    const result = explainFailure("Caused by:\n  java.lang.OutOfMemoryError: Java heap space\n");
    expect(result?.kind).toBe("out-of-memory");
    expect(result?.certainty).toBe("certain");
    expect(result?.alternatives).toEqual([]);
  });

  it("is only likely when exit status 127 is all it has", () => {
    const result = explainFailure(
      "ERROR ~ Error executing process > 'RUN (1)'\n\nCaused by:\n  Process `RUN (1)` terminated with an error exit status (127)\n\nCommand exit status:\n  127\n",
    );
    expect(result?.kind).toBe("command-not-found");
    expect(result?.certainty).toBe("likely");
    expect(result?.alternatives.length).toBeGreaterThan(0);
    expect(result?.evidence).toEqual([
      { text: "Process `RUN (1)` terminated with an error exit status (127)", line: 3 },
      { text: "Command exit status: 127", line: 6 },
    ]);
  });

  it("shows the evidence without the terminal's colour codes, on the line the log shows it", () => {
    const coloured = log("nospace").replace("No space left on device", "\u001b[31mNo space left on device\u001b[0m");
    const result = explainFailure(coloured);
    expect(result?.evidence[0]).toEqual({
      text: "dd: error writing '/scratch/genome.idx': No space left on device",
      line: 20,
    });
  });

  it("declares a certainty for every rule, and alternatives where it can be only likely", () => {
    expect(new Set(FAILURE_RULES.map((rule) => rule.kind)).size).toBe(FAILURE_RULES.length);
    for (const rule of FAILURE_RULES) {
      expect(rule.certainties.length).toBeGreaterThan(0);
      if (rule.certainties.includes("likely")) expect(rule.alternatives.length).toBeGreaterThan(0);
    }
  });

  it("explains nothing it doesn't recognise", () => {
    expect(explainFailure("ERROR ~ Something unusual happened\n")).toBeNull();
    expect(explainFailure("")).toBeNull();
  });
});

describe("the troubleshooting docs", () => {
  // GitHub's anchor for a heading: lower case, punctuation dropped, spaces as dashes.
  const anchors = readFileSync(join(__dirname, "../../../wiki/Troubleshooting.md"), "utf8")
    .split("\n")
    .filter((line) => /^#{2,4} /.test(line))
    .map((line) =>
      line
        .replace(/^#+ /, "")
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .replace(/ /g, "-"),
    );

  it("have a section for every explanation", () => {
    const explained = [
      ...["oom", "timelimit", "cnf", "missing", "pull", "nodocker", "nospace", "url", "missingout"].map((name) =>
        explainFailure(log(name)),
      ),
      explainFailure("N-WAVE resource problem: the run was stopped after its time limit.\n"),
    ];
    for (const explanation of explained) {
      expect(anchors).toContain(explanation?.docs.split("#")[1]);
    }
  });
});

describe("failedProcessOf", () => {
  it("names the failed process without its tag", () => {
    expect(failedProcessOf("ERROR ~ Error executing process > 'NFCORE_FASTQC_QC (sample1)'")).toBe(
      "NFCORE_FASTQC_QC",
    );
    expect(failedProcessOf("ERROR ~ Error executing process > 'RUN:STAR_ALIGN (a)'")).toBe("RUN:STAR_ALIGN");
  });
});

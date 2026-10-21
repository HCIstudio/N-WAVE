import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { explainFailure, failedProcessOf } from "./failureExplanations";

// Real Nextflow 25.10 output of runs that failed each way (paths shortened).
const log = (name: string) =>
  readFileSync(join(__dirname, "../test/fixtures/nextflow-failures", `${name}.txt`), "utf8");

describe("explainFailure", () => {
  it.each([
    ["oom", "out-of-memory", "SALMON_INDEX", /exit status 137/],
    ["cnf", "command-not-found", "FASTQC_QC", /runs “fastqc”, which isn't installed on this computer/],
    ["missing", "missing-input", undefined, /“reads_R1\.fastq\.gz” isn't where the workflow looks/],
    ["pull", "container-pull", "SALMON_QUANT", /container image/],
    ["nodocker", "docker-unavailable", "SALMON_INDEX", /Docker isn't running/],
    ["nospace", "no-space", "STAR_INDEX", /no space left on the disk/],
    ["url", "unreachable-url", "CAT_REF", /couldn't download https:\/\/data\.nonexistent-host-nwave\.invalid\/genome\.fa/],
    ["missingout", "missing-output", "TRIM_READS", /“trimmed\.fastq\.gz” wasn't there/],
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
      ...["oom", "cnf", "missing", "pull", "nodocker", "nospace", "url", "missingout"].map((name) =>
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

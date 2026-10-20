import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { getPortTypes } from "./nfcorePortTypes.mjs";

const { parse } = createRequire(new URL("../frontend/package.json", import.meta.url))("yaml");

test("reads input files with their patterns, and directories", () => {
  const meta = parse(`
input:
  - - meta:
        type: map
    - reads:
        type: file
        pattern: "*.{fastq,fq}.gz"
  - - meta2:
        type: map
    - index:
        type: directory
        pattern: "star"
  - star_ignore_sjdbgtf:
      type: boolean
  - index_format:
      type: string
output:
  bam:
    - - meta:
          type: map
      - "*.bam":
          type: file
          pattern: "*.{bam}"
  versions_star:
    - - \${task.process}:
          type: string
      - star:
          type: string
      - "STAR --version":
          type: eval
`);
  assert.deepEqual(getPortTypes(meta), {
    inputs: {
      reads: { type: "file", pattern: "*.{fastq,fq}.gz" },
      index: { type: "directory" },
      star_ignore_sjdbgtf: { type: "value" },
      index_format: { type: "value" },
    },
    outputs: {
      bam: { type: "file", pattern: "*.{bam}" },
      versions_star: { type: "version" },
    },
  });
});

test("reads outputs of older meta.yml files, one per element", () => {
  const meta = parse(`
output:
  - meta:
      type: map
  - html:
      type: file
      pattern: "*_{fastqc.html}"
  - versions:
      type: file
      pattern: "versions.yml"
`);
  assert.deepEqual(getPortTypes(meta).outputs, {
    html: { type: "file", pattern: "*_{fastqc.html}" },
    versions: { type: "file", pattern: "versions.yml" },
  });
});

test("has nothing for a missing or broken meta.yml", () => {
  assert.deepEqual(getPortTypes(null), { inputs: {}, outputs: {} });
  assert.deepEqual(getPortTypes("text"), { inputs: {}, outputs: {} });
});

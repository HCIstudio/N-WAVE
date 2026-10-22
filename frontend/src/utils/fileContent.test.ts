import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  encodeFileContent,
  fileByteLength,
  fileBytes,
  formatBytes,
  isBinaryFile,
  MAX_UPLOAD_BYTES,
  readUploadedFile,
} from "./fileContent";

const gzip = new Uint8Array(gzipSync("@read1\nACGT\n+\nIIII\n"));

describe("file contents", () => {
  it("keeps text files as text", () => {
    const read = encodeFileContent(new TextEncoder().encode("sample,fastq_1\nä,b\n"));
    expect(read).toEqual({ content: "sample,fastq_1\nä,b\n" });
    expect(isBinaryFile(read)).toBe(false);
    expect(fileByteLength(read)).toBe(20);
  });

  it("keeps a gzipped FASTQ byte for byte, as base64", () => {
    const read = encodeFileContent(gzip);
    expect(read.encoding).toBe("base64");
    expect(isBinaryFile(read)).toBe(true);
    // The gzip magic number survives (#144: it used to arrive as U+FFFD).
    expect(Array.from(fileBytes(read).subarray(0, 2))).toEqual([0x1f, 0x8b]);
    expect(fileBytes(read)).toEqual(gzip);
    expect(fileByteLength(read)).toBe(gzip.length);
  });

  it("treats invalid UTF-8 and NUL bytes as binary", () => {
    expect(encodeFileContent(new Uint8Array([0x66, 0xff, 0x66])).encoding).toBe("base64");
    expect(encodeFileContent(new Uint8Array([0x66, 0x00, 0x66])).encoding).toBe("base64");
  });

  it("encodes large files in chunks", () => {
    const bytes = new Uint8Array(300_000).map((_, index) => (index * 7) % 256);
    const read = encodeFileContent(bytes);
    expect(fileBytes(read)).toEqual(bytes);
    expect(fileByteLength(read)).toBe(bytes.length);
  });

  it("reads uploads", async () => {
    expect(await readUploadedFile(new File([gzip], "reads.fastq.gz"))).toMatchObject({ encoding: "base64" });
    expect(await readUploadedFile(new File(["hello"], "a.txt"))).toEqual({ content: "hello" });
  });

  it("refuses an upload too large to run, saying what to do instead", async () => {
    const big = new File(["x"], "huge.bam");
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await expect(readUploadedFile(big)).rejects.toThrow(/huge\.bam.*Samplesheet or Parameters/);
  });

  it("formats sizes", () => {
    expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1024 * 1024)]).toEqual(["12 B", "2.0 KB", "3.0 MB"]);
  });
});

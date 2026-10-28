import { describe, expect, it } from "vitest";
import { formatMemory, memoryBytes, smallerMemory } from "./memory";

describe("memory amounts", () => {
  it("reads Nextflow's ways of writing them", () => {
    expect(memoryBytes("4.GB")).toBe(4 * 1024 ** 3);
    expect(memoryBytes("512 MB")).toBe(512 * 1024 ** 2);
    expect(memoryBytes("1.5TB")).toBe(1.5 * 1024 ** 4);
    expect(memoryBytes("lots")).toBeNaN();
  });

  it("picks the smaller", () => {
    expect(smallerMemory("16.GB", "8.GB")).toBe("8.GB");
    expect(smallerMemory("512.MB", "8.GB")).toBe("512.MB");
    expect(smallerMemory("8.GB", "lots")).toBe("8.GB");
    expect(formatMemory("8.GB")).toBe("8 GB");
  });
});

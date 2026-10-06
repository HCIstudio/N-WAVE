import { describe, expect, it } from "vitest";
import {
  createLineReader,
  findResourceProblem,
  parseRunId,
} from "./streamLines";

describe("createLineReader", () => {
  it("emits each complete line once as the text grows", () => {
    const lines: string[] = [];
    const reader = createLineReader((line) => lines.push(line));
    reader.feed("N-WAVE run: wf_1\nexec");
    expect(lines).toEqual(["N-WAVE run: wf_1"]);
    reader.feed("N-WAVE run: wf_1\nexecutor > local (1)\r\n\n[ab/12");
    expect(lines).toEqual(["N-WAVE run: wf_1", "executor > local (1)"]);
    reader.flush("N-WAVE run: wf_1\nexecutor > local (1)\r\n\n[ab/12] done");
    expect(lines).toEqual([
      "N-WAVE run: wf_1",
      "executor > local (1)",
      "[ab/12] done",
    ]);
    reader.flush("N-WAVE run: wf_1\nexecutor > local (1)\r\n\n[ab/12] done");
    expect(lines).toHaveLength(3);
  });
});

describe("backend run lines", () => {
  it("reads the run id and resource problems", () => {
    expect(parseRunId("N-WAVE run: rnaseq_17")).toBe("rnaseq_17");
    expect(parseRunId("N-WAVE limits: 4 CPUs")).toBeNull();
    expect(
      findResourceProblem(
        "...\nN-WAVE resource problem: A task ran out of memory.\nNextflow execution failed with exit code: 1\n",
      ),
    ).toBe("A task ran out of memory.");
    expect(findResourceProblem("Nextflow execution failed")).toBeNull();
  });
});

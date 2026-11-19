import { describe, expect, it } from "vitest";
import golden from "./fixtures/bottlemod-python.json";
import { lastOf, PPoly } from "./ppoly";
import { func, Task, TaskExecution } from "./task";
import { linkPrio } from "./paperExamples";

// Results of BottleMod's own Python code (their ppoly.py, task.py and the
// SciPy they modified, built with their Dockerfile), recorded by
// scripts/bottlemod/recordPython.py; the port must give the same.

interface Recorded {
  x: number[];
  c: number[][];
}

/** Equal to 1e-9, relative, with infinities and NaN as such. */
const close = (actual: number, expected: number) => {
  if (!Number.isFinite(expected)) {
    expect(actual).toBe(expected);
    return;
  }
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
};

const expectSame = (actual: PPoly, expected: Recorded) => {
  expect(actual.x.length).toBe(expected.x.length);
  actual.x.forEach((value, i) => {
    close(value, expected.x[i] as number);
  });
  expect(actual.c.length).toBe(expected.c.length);
  actual.c.forEach((row, k) => {
    expect(row.length).toBe(expected.c[k]?.length);
    row.forEach((value, i) => {
      close(value, expected.c[k]?.[i] as number);
    });
  });
};

const fromRecorded = (recorded: Recorded) => PPoly.fast([...recorded.x], recorded.c.map((row) => [...row]));

describe("BottleMod's piecewise polynomials, as their Python gives them", () => {
  const { ops } = golden;
  const p1 = fromRecorded(ops.p1);
  const p2 = fromRecorded(ops.p2);
  const c = fromRecorded(ops.c);

  it("are built, added, multiplied and divided the same", () => {
    expectSame(new PPoly([-10, 2, 100], [[2, 2], [1, 1], [-1, -4]]), ops.p1);
    expectSame(p1.add(p2), ops.add);
    expectSame(p1.mul(p2), ops.mul);
    expectSame(p2.div(c), ops.div);
  });

  it("evaluate the same, in x itself, extrapolating with the first and last pieces", () => {
    for (const [x, [v1, v2]] of Object.entries(ops.eval)) {
      close(p1.at(Number(x)), v1 as number);
      close(p2.at(Number(x)), v2 as number);
    }
  });

  it("differentiate, integrate and find roots the same", () => {
    expectSame(p1.derivative(), ops.derivative);
    // Their antiderivative, discontinuities and all (see ppoly.ts, fixContinuity).
    expectSame(p1.antiderivative(), ops.antiderivative);
    close(p1.integrate(-3, 40), ops.integrate);
    const roots = [...p1.roots()].sort((a, b) => a - b);
    expect(roots.length).toBe(ops.roots_p1.length);
    roots.forEach((root, i) => {
      close(root, ops.roots_p1[i] as number);
    });
    const solved = [...p2.solve(20)].sort((a, b) => a - b);
    expect(solved.length).toBe(ops.solve_p2_20.length);
    solved.forEach((root, i) => {
      close(root, ops.solve_p2_20[i] as number);
    });
  });

  it("are sliced, cut to a piece, set and composed the same", () => {
    expectSame(p2.slice(5, 13), ops.slice);
    expectSame(p2.piece(9), ops.piece);
    const p3 = new PPoly([-10, 2, 100], [[2, 2], [1, 1], [-1, -4]]);
    p3.setSlice(6, 50, p2);
    expectSame(p3, ops.setitem);
    expectSame(fromRecorded(ops.compose.outer).compose(fromRecorded(ops.compose.inner)), ops.compose.result);
  });
});

describe("BottleMod's task execution, on the paper's examples", () => {
  const run = (outCpu: PPoly[], inCpu: PPoly[], outData: PPoly[], inData: PPoly[]) => {
    for (const oc of outCpu) oc.x[oc.x.length - 1] = (outData[0] as PPoly).at(lastOf((outData[0] as PPoly).x));
    return new TaskExecution(new Task(outCpu, outData), inCpu, inData).result();
  };

  it("gives their Test1's progress and bottlenecks", () => {
    const { progress, bottlenecks } = run(
      [0, 1, 2].map(() => new PPoly([0, 10000], [[1]])),
      [new PPoly([0, 100], [[3]]), new PPoly([0, 60, 100], [[10, 1.5]]), new PPoly([0, 40, 100], [[0.8, 10]])],
      [0, 1, 2].map(() => func([0, 100], [[1, 0]])),
      [func([0, 100], [[1, 0]]), func([0, 50, 100], [[20], [100]]), func([0, 63.245553203367585], [[0.025, 0, 0]])],
    );
    expectSame(progress, golden.test1.result);
    expect(bottlenecks).toEqual(golden.test1.bottlenecks);
    // And what their test file expects, written out there.
    expect(progress.toString()).toBe(
      [
        "  0.00 -  16.00: 0.025*x^^(2) + 0*x^^(1) + 0*x^^(0)",
        " 16.00 -  28.28: 0*x^^(2) + 0.8*x^^(1) + -6.4*x^^(0)",
        " 28.28 -  33.00: 0*x^^(2) + 0.8*x^^(1) + -6.399999999999999*x^^(0)",
        " 33.00 -  50.00: 0*x^^(2) + 0*x^^(1) + 20*x^^(0)",
        " 50.00 -  60.00: 0*x^^(2) + 3*x^^(1) + -130*x^^(0)",
        " 60.00 -  80.00: 0*x^^(2) + 1.5*x^^(1) + -40*x^^(0)",
        " 80.00 - 100.00: 0*x^^(2) + 1*x^^(1) + 0*x^^(0)",
        "",
      ].join("\n"),
    );
  });

  it("gives the progress and bottlenecks of the paper's Fig. 4 (their Test1_Plot)", () => {
    const { progress, bottlenecks } = run(
      [new PPoly([0, 20, 60, 10000], [[0.8, 4 / 3, 0.8 / 3]]), new PPoly([0, 40, 90, 10000], [[0.4, 1, 0.3]]), new PPoly([0, 30, 80, 10000], [[2, 0.8, 0.1]])],
      [new PPoly([0, 100], [[4]]), new PPoly([0, 60, 100], [[5, 1.5]]), new PPoly([0, 40, 100], [[1.6, 6.5]])],
      [0, 1, 2].map(() => func([0, 100], [[1, 0]])),
      [func([0, 100], [[1, 0]]), func([0, 50, 100], [[20], [100]]), func([0, 63.245553203367585, 100], [[0.025, 0, 0], [0, 0, 100]])],
    );
    expectSame(progress, golden.test1Plot.result);
    expect(bottlenecks).toEqual(golden.test1Plot.bottlenecks);
  });

  it("gives the video workflow's progress and bottlenecks (the paper's Fig. 8)", () => {
    for (const [share, [a, b]] of [
      ["50:50", [50, 50]],
      ["95:5", [95, 5]],
    ] as const) {
      const expected = golden.linkPrio[share];
      const actual = linkPrio(a, b);
      close(actual.total, expected.total);
      for (const step of ["dl1", "dl2", "t1", "t2", "t3"] as const) expectSame(actual[step], expected[step]);
      expect(actual.t1Bottlenecks).toEqual(expected.t1Bottlenecks);
      expect(actual.t2Bottlenecks).toEqual(expected.t2Bottlenecks);
      expect(actual.t3Bottlenecks).toEqual(expected.t3Bottlenecks);
    }
  });

  it("predicts the video workflow's runtime for every link share of the paper's Fig. 7", () => {
    for (const [share, total] of Object.entries(golden.linkPrioSweep)) {
      const i = Number(share);
      if (total === null) {
        expect(() => linkPrio(i, 12800 - i)).toThrow();
        continue;
      }
      close(linkPrio(i, 12800 - i).total, total);
    }
  });
});

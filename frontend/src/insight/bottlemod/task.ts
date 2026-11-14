// BottleMod's tasks and their execution, ported to TypeScript from task.py and
// func.py of BottleMod (Lößer, Witzke, Schintke, Scheuermann, ICPE '25,
// https://doi.org/10.1145/3676151.3719382; https://github.com/bottlemod/bottlemod).
//
// A task has requirement functions: for each resource (CPU time, a link's
// data), how much of it a given progress needs; for each data input, how much
// progress a given amount of that input allows. A task's execution adds the
// environment's input functions (how much of each resource per second, how
// much input data has arrived at time t) and calculates the progress over
// time, and for each piece of it what limited it: a data input (index >= 0)
// or a resource (-1 - index).

import { bisectLeft, bisectRight, type Coefficients, lastOf, PPoly } from "./ppoly";

/** A monotonically increasing piecewise polynomial (their Func); c is given by piece. */
export const func = (x: number[], c: number[][]): PPoly => {
  const byDegree: Coefficients = (c[0] ?? []).map((_, k) => c.map((piece) => piece[k] as number));
  const f = new PPoly(x, byDegree);
  const d1 = f.derivative();
  const d2 = d1.derivative();
  for (const bpx of f.x.slice(0, -1)) {
    if (d1.at(bpx) < 0) throw new Error("Piecewise defined polynomial must be monotonically increasing.");
  }
  for (const xp of d1.roots()) {
    if (d2.at(xp) < 0) throw new Error("Piecewise defined polynomial must be monotonically increasing.");
  }
  return f;
};

export class Task {
  constructor(
    readonly cpuFuncs: PPoly[],
    readonly dataFuncs: PPoly[],
  ) {
    const maxData = lastOf((cpuFuncs[0] as PPoly).x) as number;
    for (const cpuFunc of cpuFuncs) {
      if (lastOf(cpuFunc.x) !== maxData) throw new Error("All CPU functions must have the same range on x axis.");
    }
    for (const dataFunc of dataFuncs) {
      if (dataFunc.at(lastOf(dataFunc.x) as number) !== maxData) throw new Error("All data funcs must have the same end output.");
    }
  }
}

/** The task would never finish with the given resources. */
export class NeverFinishesError extends Error {}

/** A value as NumPy would give it to Python's min(): a number, or an array of them. */
type Numeric = number | number[];

/** Python's truth value of a NumPy comparison result. */
const truthy = (value: boolean | boolean[]): boolean => {
  if (typeof value === "boolean") return value;
  if (value.length === 0) return false;
  if (value.length === 1) return value[0] as boolean;
  throw new Error("The truth value of an array with more than one element is ambiguous.");
};

const lessThan = (a: Numeric, b: Numeric): boolean | boolean[] => {
  if (typeof a === "number" && typeof b === "number") return a < b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length && a.length !== 1 && b.length !== 1) throw new Error("operands could not be broadcast together");
    const n = Math.max(a.length, b.length);
    return Array.from({ length: n }, (_, i) => (a[a.length === 1 ? 0 : i] as number) < (b[b.length === 1 ? 0 : i] as number));
  }
  if (Array.isArray(a)) return a.map((value) => value < (b as number));
  return (b as number[]).map((value) => (a as number) < value);
};

/** Python's min() over numbers and NumPy arrays (as their code calls it with solve()'s result). */
const pyMin = (...values: Numeric[]): number => {
  let m = values[0] as Numeric;
  for (const value of values.slice(1)) if (truthy(lessThan(value, m))) m = value;
  if (typeof m === "number") return m;
  if (m.length === 1) return m[0] as number;
  throw new Error("min() ended on an array that is not a single value.");
};

const last = <T>(values: T[]): T => values[values.length - 1] as T;

export class TaskExecution {
  realOut: PPoly | null = null;
  bottlenecks: number[] = [];

  constructor(
    private readonly task: Task,
    private readonly inCpuFuncs: PPoly[],
    private readonly inDataFuncs: PPoly[],
  ) {
    if (inDataFuncs.length !== task.dataFuncs.length) {
      throw new Error("Must have one input data function for each of the tasks output data function.");
    }
    if (inCpuFuncs.length !== task.cpuFuncs.length) {
      throw new Error("Must have one input cpu function for each of the tasks output cpu function.");
    }
    this.calculate();
  }

  static lastSegment(f: PPoly, x: number): PPoly {
    const lastSectionIndex = bisectLeft(f.x, x) - 1;
    return lastSectionIndex >= 0 ? f.piece(f.x[lastSectionIndex] as number) : new PPoly([0, 1], [[0]]);
  }

  /** How fast one resource lets the task progress at t: [speed, up to which progress it holds]. */
  static getSpeed(inFunction: PPoly, outFunction: PPoly, t: number, progress: number): [PPoly, number] {
    const inSegment = TaskExecution.nextSegmentOnly(inFunction, t);
    const relevant = outFunction.piece(progress);
    const maxProgressValidity = lastOf(relevant.x) as number;
    relevant.x[0] = -Infinity;
    relevant.x[1] = Infinity;
    return [inSegment.div(relevant), maxProgressValidity];
  }

  static precisionThreshold(value: number): number {
    return 40 * value * 10 ** -15;
  }

  private calculate(): void {
    const [realDataOut, dataBottleneckList] = TaskExecution.ppolyMin(
      this.task.dataFuncs.map((out, i) => out.compose(this.inDataFuncs[i] as PPoly)),
    );
    let realOut = new PPoly(realDataOut.x, realDataOut.c);
    let bottlenecks = [...dataBottleneckList];
    const maxValue = realOut.at(last(realOut.x));
    let cur = 0;
    while (Math.abs(TaskExecution.lastSegment(realOut, cur).at(cur) - maxValue) > TaskExecution.precisionThreshold(maxValue)) {
      const lastSegment = TaskExecution.lastSegment(realOut, cur);
      let next = TaskExecution.segmentEnd(realOut, cur);
      const currentSegment = realOut.slice(cur, next);
      const currentDataSegment = realDataOut.slice(cur, next);
      const speedlist = this.inCpuFuncs.map((inI, i) =>
        TaskExecution.getSpeed(inI, this.task.cpuFuncs[i] as PPoly, cur, lastSegment.at(cur)),
      );
      const [speed, rawSpeedBottlenecks] = TaskExecution.ppolyMinNextSegment(
        speedlist.map((s) => s[0]),
        cur,
      );
      const speedMaxProgress = Math.min(...speedlist.map((s) => s[1]));
      const speedBottleneckList = rawSpeedBottlenecks.map((b) => -1 - b);
      next = Math.min(next, speed.x[1] as number);
      const ispeed = speed.antiderivative();

      let gap = currentDataSegment.sub(lastSegment).at(cur);
      const threshold = TaskExecution.precisionThreshold(currentDataSegment.at(cur));
      gap = Math.abs(gap) < threshold ? 0 : gap;
      if (gap < 0) throw new Error("Gap is negative, but must not be. Calculation is probably alternative correct.");
      if (gap !== 0) {
        const f = ispeed.sub(ispeed.at(cur)).add(lastSegment.at(cur));
        let roots = f.sub(currentDataSegment).roots();
        roots = roots.slice(bisectRight(roots, cur));
        next = pyMin(next, roots.length > 0 ? (roots[0] as number) : Infinity, f.solve(Math.min(maxValue, speedMaxProgress)));
        [realOut, bottlenecks] = TaskExecution.splice(realOut, bottlenecks, cur, next, ispeed.x, speedBottleneckList, f);
      } else {
        const rod = currentSegment.derivative();
        let roots = rod.sub(speed).roots();
        roots = roots.slice(bisectRight(roots, cur));
        next = Math.min(next, roots.length > 0 ? (roots[0] as number) : Infinity, realOut.piece(cur).x[1] as number, speed.piece(cur).x[1] as number);
        if (rod.at(cur) > speed.at(cur) || (rod.at(cur) === speed.at(cur) && rod.derivative().at(cur) > 0)) {
          const f = ispeed.sub(ispeed.at(cur)).add(currentSegment.at(cur));
          let froots = f.sub(currentDataSegment).roots();
          froots = froots.slice(bisectRight(froots, cur));
          next = pyMin(next, froots.length > 0 ? (froots[0] as number) : Infinity, f.solve(Math.min(maxValue, speedMaxProgress)));
          [realOut, bottlenecks] = TaskExecution.splice(realOut, bottlenecks, cur, next, f.x, speedBottleneckList, f);
        } else if (Number.isFinite(speedMaxProgress)) {
          let sroots = currentSegment.solve(speedMaxProgress);
          sroots = sroots.slice(bisectRight(sroots, cur));
          if (sroots.length > 0) next = Math.min(next, sroots[0] as number);
        }
      }
      if (next === cur) throw new NeverFinishesError("Task would never finish with the given resources.");
      cur = next;
    }
    this.realOut = realOut.slice(undefined, cur);
    this.bottlenecks = bottlenecks.slice(0, this.realOut.pieces);
  }

  /** Puts f into realOut between cur and next, with its bottlenecks (their two repeated blocks). */
  private static splice(
    realOut: PPoly,
    bottlenecks: number[],
    cur: number,
    next: number,
    fx: number[],
    speedBottleneckList: number[],
    f: PPoly,
  ): [PPoly, number[]] {
    let curRealOutIndex = bisectRight(realOut.x, cur) - 1;
    if (realOut.x[curRealOutIndex] !== cur) curRealOutIndex += 1;
    const curFuncIndex = bisectRight(fx, cur) - 1;
    const nextRealOutIndex = bisectRight(realOut.x, next) - 1;
    let nextFuncIndex = bisectRight(fx, next) - 1;
    if (fx[nextFuncIndex] !== next) nextFuncIndex += 1;
    const inserted = pyListSlice(speedBottleneckList, curFuncIndex, nextFuncIndex);
    let updated = [...pyListSlice(bottlenecks, 0, curRealOutIndex), ...inserted, ...pyListSlice(bottlenecks, nextRealOutIndex, undefined)];
    realOut.setSlice(cur, next, f);
    let deletedIndex = 0;
    if (!realOut.x.includes(cur)) {
      updated = pyDelete(updated, nextRealOutIndex);
      deletedIndex = 1;
    }
    if (!realOut.x.includes(next)) {
      updated = pyDelete(updated, nextRealOutIndex + inserted.length - deletedIndex);
    }
    return [realOut, updated];
  }

  /** Indices where the list has its minimum. */
  static argminInGood(values: number[]): number[] {
    const minval = Math.min(...values);
    return values.flatMap((value, i) => (value === minval ? [i] : []));
  }

  /** The lower of two functions, and which one it is, piece by piece. */
  static ppolyMin2(func1: PPoly, func2: PPoly): [PPoly, number[]] {
    const all = [...func1.x, ...func2.x];
    const minx = Math.min(...all.filter((x) => x !== -Infinity));
    const maxx = Math.max(...all);
    const res = new PPoly([-Infinity, minx], [[Math.min(func1.at(minx), func2.at(minx))]]);
    let reslist: number[] = [];
    const diff = func1.sub(func2);
    const sortedRoots = [...diff.roots()].sort(pythonFloatOrder);
    for (const root of sortedRoots) {
      if (root <= minx || root >= maxx || Number.isNaN(root) || root <= last(res.x)) continue;
      if (diff.integrate(last(res.x), root) < 0) {
        const xpoly = func1.slice(last(res.x), root);
        res.extend(xpoly.c, xpoly.x.slice(1));
        reslist = [...reslist, ...new Array<number>(xpoly.pieces).fill(0)];
      } else {
        const xpoly = func2.slice(last(res.x), root);
        res.extend(xpoly.c, xpoly.x.slice(1));
        reslist = [...reslist, ...new Array<number>(xpoly.pieces).fill(1)];
      }
    }
    if (diff.integrate(last(res.x), maxx) < 0) {
      const xpoly = func1.slice(last(res.x), maxx);
      res.extend(xpoly.c, xpoly.x.slice(1));
      reslist = [...reslist, ...new Array<number>(xpoly.pieces).fill(0)];
    } else {
      const xpoly = func2.slice(last(res.x), maxx);
      res.extend(xpoly.c, xpoly.x.slice(1));
      reslist = [...reslist, ...new Array<number>(xpoly.pieces).fill(1)];
    }
    return [res.slice(minx, last(res.x)), reslist];
  }

  /** The lowest of the functions, and which one it is, piece by piece. */
  static ppolyMin(funcs: PPoly[]): [PPoly, number[]] {
    if (funcs.length === 1) return [funcs[0] as PPoly, new Array<number>((funcs[0] as PPoly).pieces).fill(0)];
    let [res, reslist] = TaskExecution.ppolyMin2(funcs[0] as PPoly, funcs[1] as PPoly);
    funcs.slice(2).forEach((f, i) => {
      const [newres, mergelist] = TaskExecution.ppolyMin2(res, f);
      newres.x.slice(0, -1).forEach((x, j) => {
        if (mergelist[j] === 1) mergelist[j] = i + 2;
        else {
          const oldsection = bisectRight(res.x, x) - 1;
          mergelist[j] = reslist[Math.max(oldsection, 0)] as number;
        }
      });
      res = newres;
      reslist = mergelist;
    });
    return [res, reslist];
  }

  static ppolyMinNextSegment(funcs: PPoly[], segmentStart: number): [PPoly, number[]] {
    const segments = funcs.map((f) => TaskExecution.nextSegmentOnly(f, segmentStart));
    const [res, reslist] = TaskExecution.ppolyMin(segments);
    if (res.x[0] !== segmentStart) throw new Error("Something went wrong.");
    res.x[1] = Math.min(...segments.map((f) => f.x[1] as number));
    return [res, reslist];
  }

  static segmentEnd(f: PPoly, start: number): number {
    const idx = bisectLeft(f.x, start);
    if (idx === f.x.length) return Infinity;
    if (start === f.x[idx]) return idx + 1 < f.x.length ? (f.x[idx + 1] as number) : Infinity;
    return f.x[idx] as number;
  }

  static nextSegmentOnly(f: PPoly, start: number): PPoly {
    return f.slice(start, TaskExecution.segmentEnd(f, start));
  }

  /** The progress over time and, per piece, what limited it. */
  result(): { progress: PPoly; bottlenecks: number[] } {
    return { progress: this.realOut as PPoly, bottlenecks: this.bottlenecks };
  }
}

/** Python's sorted() on floats: NaN compares false both ways, so it stays where the sort leaves it. */
const pythonFloatOrder = (a: number, b: number): number => {
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return a - b;
};

/** Python list slicing. */
const pyListSlice = <T>(values: T[], start: number, stop: number | undefined): T[] => {
  const n = values.length;
  const norm = (value: number) => (value < 0 ? Math.max(n + value, 0) : Math.min(value, n));
  return values.slice(norm(start), stop === undefined ? n : norm(stop));
};

/** Python's `del values[index]` (negative indices from the end). */
const pyDelete = <T>(values: T[], index: number): T[] => {
  const i = index < 0 ? values.length + index : index;
  if (i < 0 || i >= values.length) throw new Error("list assignment index out of range");
  return [...values.slice(0, i), ...values.slice(i + 1)];
};

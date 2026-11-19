// BottleMod's piecewise polynomials, ported to TypeScript from ppoly.py of
// BottleMod (Lößer, Witzke, Schintke, Scheuermann: "BottleMod: Modeling Data
// Flows and Tasks for Fast Bottleneck Analysis", ICPE '25,
// https://doi.org/10.1145/3676151.3719382; https://github.com/bottlemod/bottlemod),
// together with the parts of SciPy's PPoly it uses, in BottleMod's modified
// form: each piece is a polynomial in x itself, not in x minus the piece's
// start (custom_scipy/_ppoly_v1.15.1.pyx).
//
// The port follows their code step by step, including how it treats
// breakpoints and extrapolation, so that it gives the same results; where
// their code relies on NumPy's or SciPy's behaviour, the same is done here.

/** The last element (Array.prototype.at is beyond this project's TypeScript target). */
export const lastOf = <T>(values: readonly T[]): T => values[values.length - 1] as T;

/** Coefficients by degree, highest first, then by piece: c[k][i]. */
export type Coefficients = number[][];

/** Python's bisect.bisect_right. */
export const bisectRight = (values: ArrayLike<number>, x: number): number => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x < (values[mid] as number)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

/** Python's bisect.bisect_left. */
export const bisectLeft = (values: ArrayLike<number>, x: number): number => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const zeros = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

/** The coefficients of one piece (a column), highest degree first. */
const column = (c: Coefficients, i: number): number[] => c.map((row) => row[i] as number);

/** Evaluates c[:, ci] at s: its value, a derivative (dx > 0) or antiderivative (dx < 0). */
const evaluatePoly1 = (s: number, c: Coefficients, ci: number, dx: number): number => {
  // _ppoly.pyx evaluate_poly1, in BottleMod's version (s is x itself).
  let res = 0;
  let z = 1;
  if (dx < 0) for (let k = 0; k < -dx; k++) z *= s;
  const n = c.length;
  for (let kp = 0; kp < n; kp++) {
    let prefactor: number;
    if (dx === 0) prefactor = 1;
    else if (dx > 0) {
      if (kp < dx) continue;
      prefactor = 1;
      for (let k = kp; k > kp - dx; k--) prefactor *= k;
    } else {
      prefactor = 1;
      for (let k = kp; k < kp - dx; k++) prefactor /= k + 1;
    }
    res = res + (c[n - kp - 1]?.[ci] as number) * z * prefactor;
    if (kp < n - 1 && kp >= dx) z *= s;
  }
  return res;
};

/** SciPy's find_interval_ascending, with extrapolation. */
const findInterval = (x: number[], xval: number): number => {
  const nx = x.length;
  if (Number.isNaN(xval)) return -1;
  const a = x[0] as number;
  const b = x[nx - 1] as number;
  if (xval < a) return 0;
  if (xval >= b) return nx - 2;
  // x[i] <= xval < x[i+1]
  let interval = bisectRight(x, xval) - 1;
  if (interval < 0) interval = 0;
  if (interval > nx - 2) interval = nx - 2;
  return interval;
};

/** Real roots of c[:, ci] = y (SciPy's croots_poly1, real ones only, ascending). */
const realRootsOfPiece = (c: Coefficients, y: number, ci: number): { identicallyZero: boolean; roots: number[] } => {
  const n = c.length;
  let order = -1;
  for (let j = 0; j < n; j++) {
    if ((c[j]?.[ci] as number) !== 0) {
      order = n - 1 - j;
      break;
    }
  }
  if (order < 0) return y === 0 ? { identicallyZero: true, roots: [] } : { identicallyZero: false, roots: [] };
  if (order === 0) {
    return (c[n - 1]?.[ci] as number) === y ? { identicallyZero: true, roots: [] } : { identicallyZero: false, roots: [] };
  }
  const coef = (k: number) => c[n - 1 - order + k]?.[ci] as number;
  if (order === 1) {
    const a0 = coef(0);
    const a1 = coef(1) - y;
    return { identicallyZero: false, roots: [-a1 / a0] };
  }
  if (order === 2) {
    const a0 = coef(0);
    const a1 = coef(1);
    const a2 = coef(2) - y;
    let d = a1 * a1 - 4 * a0 * a2;
    if (d < 0) return { identicallyZero: false, roots: [] };
    d = Math.sqrt(d);
    if (d === 0) return { identicallyZero: false, roots: [-a1 / (2 * a0), -a1 / (2 * a0)] };
    if (a1 < 0) return { identicallyZero: false, roots: [(2 * a2) / (-a1 + d), (-a1 + d) / (2 * a0)] };
    return { identicallyZero: false, roots: [(-a1 - d) / (2 * a0), (2 * a2) / (-a1 - d)] };
  }
  // Higher orders: SciPy takes the eigenvalues of the companion matrix
  // (LAPACK). Here the real roots are bracketed between the roots of the
  // derivative and found by bisection, to full precision.
  const poly = Array.from({ length: order + 1 }, (_, k) => coef(k));
  poly[order] = (poly[order] as number) - y;
  return { identicallyZero: false, roots: realPolynomialRoots(poly) };
};

const evalPoly = (p: number[], x: number): number => p.reduce((acc, a) => acc * x + a, 0);

/** Real roots of a polynomial (coefficients highest first), ascending, with multiple roots repeated once. */
export const realPolynomialRoots = (p: number[]): number[] => {
  let start = 0;
  while (start < p.length - 1 && p[start] === 0) start++;
  const poly = p.slice(start);
  const degree = poly.length - 1;
  if (degree <= 0) return [];
  if (degree === 1) return [-(poly[1] as number) / (poly[0] as number)];
  const derivative = poly.slice(0, -1).map((a, k) => a * (degree - k));
  const critical = realPolynomialRoots(derivative);
  // Cauchy's bound on the roots.
  const lead = poly[0] as number;
  const bound = 1 + Math.max(...poly.slice(1).map((a) => Math.abs(a / lead)));
  const points = [-bound, ...critical.filter((x) => x > -bound && x < bound), bound];
  const roots: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    let lo = points[i] as number;
    let hi = points[i + 1] as number;
    let flo = evalPoly(poly, lo);
    const fhi = evalPoly(poly, hi);
    if (flo === 0) {
      if (lastOf(roots) !== lo) roots.push(lo);
      continue;
    }
    if (fhi === 0 || Math.sign(flo) === Math.sign(fhi)) continue;
    for (let step = 0; step < 200 && hi - lo > 0; step++) {
      const mid = lo + (hi - lo) / 2;
      if (mid === lo || mid === hi) break;
      const fmid = evalPoly(poly, mid);
      if (fmid === 0) {
        lo = hi = mid;
        break;
      }
      if (Math.sign(fmid) === Math.sign(flo)) {
        lo = mid;
        flo = fmid;
      } else hi = mid;
    }
    roots.push(lo + (hi - lo) / 2);
  }
  const last = lastOf(points) as number;
  if (evalPoly(poly, last) === 0 && lastOf(roots) !== last) roots.push(last);
  return roots;
};

export class PPoly {
  /** Breakpoints (non-decreasing); piece i covers x[i] to x[i + 1]. */
  x: number[];
  c: Coefficients;

  /** Like their PPoly(x, c): leading all-zero rows are dropped. */
  constructor(x: number[], c: Coefficients) {
    const xs = [...x];
    if (xs.length > 1 && (xs[0] as number) > (xs[1] as number)) throw new Error("`x` must be strictly increasing.");
    let rows = c.map((row) => [...row]);
    while (rows.length > 1 && (rows[0] as number[]).every((value) => value === 0)) rows = rows.slice(1);
    PPoly.check(xs, rows);
    this.x = xs;
    this.c = rows;
  }

  /** SciPy's construct_fast: no dropping of zero rows. */
  static fast(x: number[], c: Coefficients): PPoly {
    const p = Object.create(PPoly.prototype) as PPoly;
    p.x = x;
    p.c = c;
    return p;
  }

  private static check(x: number[], c: Coefficients): void {
    if (x.length < 2) throw new Error("At least 2 breakpoints are needed.");
    if (c.length < 1) throw new Error("Coefficients array must be at least 2-dimensional.");
    for (const row of c) {
      if (row.length !== x.length - 1) throw new Error("Shapes of x and c are incompatible.");
    }
    const increasing = x.every((value, i) => i === 0 || value >= (x[i - 1] as number));
    const decreasing = x.every((value, i) => i === 0 || value <= (x[i - 1] as number));
    if (!increasing && !decreasing) throw new Error("`x` must be strictly increasing or decreasing.");
  }

  /** How many pieces. */
  get pieces(): number {
    return this.c[0]?.length ?? 0;
  }

  // ---- SciPy's PPoly ----

  /** The value (or nu-th derivative) at x, extrapolating with the first and last pieces. */
  at(xval: number, nu = 0): number {
    const i = findInterval(this.x, xval);
    if (i < 0) return Number.NaN;
    return evaluatePoly1(xval, this.c, i, nu);
  }

  derivative(nu = 1): PPoly {
    if (nu < 0) return this.antiderivative(-nu);
    if (nu === 0) return PPoly.fast([...this.x], this.c.map((row) => [...row]));
    const k = this.c.length;
    let c2: Coefficients;
    if (nu >= k) c2 = zeros(1, this.pieces);
    else {
      c2 = this.c.slice(0, k - nu).map((row) => [...row]);
      // multiply by the correct rising factorials
      for (let r = 0; r < c2.length; r++) {
        const power = k - 1 - r;
        let factor = 1;
        for (let j = 0; j < nu; j++) factor *= power - j;
        c2[r] = (c2[r] as number[]).map((value) => value * factor);
      }
    }
    if (c2.length === 0) c2 = zeros(1, this.pieces);
    return PPoly.fast([...this.x], c2);
  }

  antiderivative(nu = 1): PPoly {
    if (nu <= 0) return this.derivative(-nu);
    const k = this.c.length;
    const c2 = zeros(k + nu, this.pieces);
    for (let r = 0; r < k; r++) {
      const power = k - 1 - r;
      let factor = 1;
      for (let j = 1; j <= nu; j++) factor *= power + j;
      c2[r] = (this.c[r] as number[]).map((value) => value / factor);
    }
    fixContinuity(c2, this.x, nu - 1);
    return PPoly.fast([...this.x], c2);
  }

  /** The definite integral from a to b. */
  integrate(a: number, b: number): number {
    let sign = 1;
    if (b < a) {
      [a, b] = [b, a];
      sign = -1;
    }
    const start = findInterval(this.x, a);
    const end = findInterval(this.x, b);
    if (start < 0 || end < 0) return Number.NaN;
    let total = 0;
    for (let interval = start; interval <= end; interval++) {
      const vb = interval === end ? evaluatePoly1(b, this.c, interval, -1) : evaluatePoly1(this.x[interval + 1] as number, this.c, interval, -1);
      const va = interval === start ? evaluatePoly1(a, this.c, interval, -1) : evaluatePoly1(this.x[interval] as number, this.c, interval, -1);
      total += vb - va;
    }
    return sign * total;
  }

  /** Where the function equals y (SciPy's solve, discontinuities counted). */
  solve(y = 0, discontinuity = true): number[] {
    return realRoots(this.c, this.x, y, discontinuity);
  }

  /** Appends pieces (c) with their breakpoints (x, without the first). */
  extend(c: Coefficients, x: number[]): void {
    if (x.length === 0) return;
    if (!x.every((value, i) => i === 0 || value >= (x[i - 1] as number))) {
      throw new Error("`x` is not sorted.");
    }
    if (!((x[0] as number) >= (lastOf(this.x) as number))) {
      if (!((lastOf(x) as number) <= (this.x[0] as number))) throw new Error("`x` is neither on the left or on the right from `self.x`.");
      const k2 = Math.max(c.length, this.c.length);
      const c2 = zeros(k2, this.pieces + (c[0]?.length ?? 0));
      const added = c[0]?.length ?? 0;
      place(c2, c, k2 - c.length, 0);
      place(c2, this.c, k2 - this.c.length, added);
      this.x = [...x, ...this.x];
      this.c = c2;
      return;
    }
    const k2 = Math.max(c.length, this.c.length);
    const pieces = this.pieces;
    const c2 = zeros(k2, pieces + (c[0]?.length ?? 0));
    place(c2, this.c, k2 - this.c.length, 0);
    place(c2, c, k2 - c.length, pieces);
    this.x = [...this.x, ...x];
    this.c = c2;
  }

  // ---- BottleMod's PPoly ----

  neg(): PPoly {
    return new PPoly(this.x, this.c.map((row) => row.map((value) => -value)));
  }

  add(other: PPoly | number): PPoly {
    if (typeof other === "number") {
      return this.add(new PPoly([this.x[0] as number, lastOf(this.x) as number], [[other]]));
    }
    const newx: number[] = [];
    let newc: number[][] = Array.from({ length: Math.max(this.c.length, other.c.length) }, () => []);
    let lastx: number | null = null;
    let lastpoly: number[] = [];
    for (const x of mergeSorted(this.x, other.x).slice(0, -1)) {
      if (x !== lastx) {
        const newpoly = addPoly(column(this.piece(x).c, 0), column(other.piece(x).c, 0));
        if (newpoly.length !== lastpoly.length || newpoly.some((value, i) => value !== lastpoly[i])) {
          lastpoly = newpoly;
          newx.push(x);
          newc = appendColumn(newc, newpoly);
          lastx = x;
        }
      }
    }
    return new PPoly([...newx, Math.max(lastOf(this.x) as number, lastOf(other.x) as number)], newc);
  }

  sub(other: PPoly | number): PPoly {
    return this.add(typeof other === "number" ? -other : other.neg());
  }

  mul(other: PPoly | number): PPoly {
    if (typeof other === "number") return new PPoly(this.x, this.c.map((row) => row.map((value) => value * other)));
    const newx: number[] = [];
    let newc: number[][] = Array.from({ length: this.c.length + other.c.length }, () => []);
    let lastx: number | null = null;
    let lastpoly: number[] = [];
    for (const x of mergeSorted(this.x, other.x).slice(0, -1)) {
      if (x !== lastx) {
        const newpoly = mulPoly(column(this.piece(x).c, 0), column(other.piece(x).c, 0));
        if (newpoly.length !== lastpoly.length || newpoly.some((value, i) => value !== lastpoly[i])) {
          lastpoly = newpoly;
          newx.push(x);
          newc = appendColumn(newc, newpoly);
          lastx = x;
        }
      }
    }
    return new PPoly([...newx, Math.max(lastOf(this.x) as number, lastOf(other.x) as number)], newc);
  }

  /** Divides by a piecewise constant function or a number. */
  div(other: PPoly | number): PPoly {
    if (typeof other === "number") return new PPoly(this.x, this.c.map((row) => row.map((value) => value / other)));
    if (other.c.length !== 1) throw new Error("Divisor of PPoly division must be a piecewise constant function.");
    const newx = PPoly.intersectionRange(this.x, other.x);
    let newc: number[][] = Array.from({ length: this.c.length }, () => []);
    let lastpoly: number[] = [];
    for (const x of newx.slice(0, -1)) {
      const divisor = other.piece(x).c[0]?.[0] as number;
      const newpoly = column(this.piece(x).c, 0).map((value) => value / divisor);
      if (newpoly.length !== lastpoly.length || newpoly.some((value, i) => value !== lastpoly[i])) {
        lastpoly = newpoly;
        newc = appendColumn(newc, newpoly);
      }
    }
    return new PPoly(newx, newc);
  }

  /** The breakpoints of both within the range where both are defined. */
  static intersectionRange(x1: number[], x2: number[]): number[] {
    const minx = Math.max(x1[0] as number, x2[0] as number);
    const maxx = Math.min(lastOf(x1) as number, lastOf(x2) as number);
    return [...new Set([...x1, ...x2].filter((x) => x >= minx && x <= maxx))].sort((a, b) => a - b);
  }

  /** This function of `inner`: this(inner(x)). Only for monotonically increasing `inner`. */
  compose(inner: PPoly): PPoly {
    const otherpows: PPoly[] = [new PPoly([-Infinity, Infinity], [[1]]), inner];
    for (let i = 0; i < this.c.length - 1; i++) otherpows.push((lastOf(otherpows) as PPoly).mul(inner));
    let outerchanges: number[] = [];
    for (const x of this.x) {
      let changes = inner.solve(x);
      changes = changes
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => a - b)
        .filter((value) => Math.abs(inner.at(value) - x) < 0.0001);
      if (changes.length > 0) outerchanges = [...outerchanges, lastOf(changes) as number];
    }
    const newx: number[] = [];
    let newc: number[][] = Array.from({ length: this.c.length * inner.c.length }, () => []);
    let lastx: number | null = null;
    let lastpoly: number[] = [];
    for (const x of mergeSorted(outerchanges, inner.x).slice(0, -1)) {
      if (x !== lastx) {
        const newpoly = insertPoly(x, this, otherpows);
        if (newpoly.length !== lastpoly.length || newpoly.some((value, i) => value !== lastpoly[i])) {
          lastpoly = newpoly;
          newx.push(x);
          newc = appendColumn(newc, newpoly);
          lastx = x;
        }
      }
    }
    return new PPoly([...newx, Math.max(lastOf(outerchanges) as number, lastOf(inner.x) as number)], newc);
  }

  /** Roots; with `discontinuity`, also where a jump crosses zero. */
  roots(discontinuity = true): number[] {
    const result = realRoots(this.c, this.x, 0, false);
    if (discontinuity) {
      let lastsector = this.piece(this.x[0] as number);
      for (const bp of this.x.slice(1, -1)) {
        const thissector = this.piece(bp);
        const before = lastsector.at(bp);
        const after = thissector.at(bp);
        if ((before < 0 && after > 0) || (before > 0 && after < 0)) result.push(bp);
        lastsector = thissector;
      }
    }
    return result;
  }

  /** The piece that x is in, as a function of its own (their self[x]). */
  piece(x: number): PPoly {
    let idx = bisectRight(this.x, x);
    idx = idx > 0 ? idx - 1 : 0;
    const n = this.x.length;
    const startpos = idx >= n - 1 ? (this.x[n - 2] as number) : idx > 0 ? (this.x[idx] as number) : -Infinity;
    const endpos = idx + 1 < n ? (this.x[idx + 1] as number) : Infinity;
    return new PPoly(
      [startpos, endpos],
      this.c.map((row) => [row[idx < row.length ? idx : row.length - 1] as number]),
    );
  }

  /** The function between start and stop (their self[start:stop]). */
  slice(start?: number, stop?: number): PPoly {
    const startpos = start ?? (this.x[0] as number);
    const endpos = stop ?? (lastOf(this.x) as number);
    let startidx = bisectRight(this.x, startpos);
    startidx = startidx > 0 ? startidx - 1 : 0;
    let endidx = bisectRight(this.x, endpos);
    endidx = endidx > 0 ? endidx - 1 : 0;
    const newx = this.x.slice(startidx, endidx + 1);
    newx[0] = startpos;
    if (endpos > (lastOf(this.x) as number) && newx.length > 1) newx[newx.length - 1] = endpos;
    else if (!this.x.includes(endpos)) newx.push(endpos);
    const pieces = this.pieces;
    startidx = startidx < pieces ? startidx : pieces - 1;
    endidx = endidx < pieces ? endidx : pieces - 1;
    endidx = this.x.slice(0, -1).includes(endpos) ? endidx - 1 : endidx;
    return new PPoly(
      newx,
      this.c.map((row) => pySlice(row, startidx, endidx + 1)),
    );
  }

  /** Replaces the function between start and stop by `val` there (their self[start:stop] = val). */
  setSlice(start: number | undefined, stop: number | undefined, val: PPoly): void {
    const startpos = start ?? -Infinity;
    const endpos = stop ?? Infinity;
    let result: PPoly;
    if (startpos > (this.x[0] as number)) {
      result = this.slice(undefined, startpos);
      let insert = val.slice(startpos, endpos);
      if (!equalCoefficients(column(result.c, result.pieces - 1), column(insert.c, 0))) {
        result.extend(insert.c, insert.x.slice(1));
      } else {
        result.x[result.x.length - 1] = insert.x[1] as number;
        if (insert.x.length > 2) {
          insert = new PPoly(insert.x.slice(1), insert.c.map((row) => row.slice(1)));
          result.extend(insert.c, insert.x.slice(1));
        }
      }
    } else {
      result = val.slice(startpos, endpos);
    }
    if ((lastOf(this.x) as number) > endpos) {
      let insert = this.slice(endpos, undefined);
      if (!equalCoefficients(column(result.c, result.pieces - 1), column(insert.c, 0))) {
        result.extend(insert.c, insert.x.slice(1));
      } else {
        result.x[result.x.length - 1] = insert.x[1] as number;
        if (insert.x.length > 2) {
          insert = new PPoly(insert.x.slice(1), insert.c.map((row) => row.slice(1)));
          result.extend(insert.c, insert.x.slice(1));
        }
      }
    }
    this.x = result.x;
    this.c = result.c;
  }

  /** Readable form, as their __str__. */
  toString(): string {
    const fmt = (value: number) => value.toFixed(2);
    const xs = this.x.map(fmt);
    const maxlen = Math.max(...xs.map((value) => value.length));
    let out = "";
    for (let i = 0; i < this.pieces; i++) {
      const terms = column(this.c, i).map((value, k, all) => `${value}*x^^(${all.length - 1 - k})`);
      out += `${(xs[i] as string).padStart(maxlen)} - ${(xs[i + 1] as string).padStart(maxlen)}: ${terms.join(" + ")}\n`;
    }
    return out;
  }
}

/** Copies `from` into `into`, its rows starting at `row` and columns at `column`. */
const place = (into: number[][], from: Coefficients, row: number, column: number): void => {
  for (let r = 0; r < from.length; r++) {
    const source = from[r] as number[];
    const target = into[row + r] as number[];
    for (let i = 0; i < source.length; i++) target[column + i] = source[i] as number;
  }
};

/** NumPy slicing of a row: negative and out-of-range ends as Python does. */
const pySlice = (row: number[], start: number, stop: number): number[] => {
  const n = row.length;
  const norm = (value: number) => (value < 0 ? Math.max(n + value, 0) : Math.min(value, n));
  return row.slice(norm(start), norm(stop));
};

/** heapq.merge of two sorted lists. */
const mergeSorted = (a: number[], b: number[]): number[] => {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if ((b[j] as number) < (a[i] as number)) out.push(b[j++] as number);
    else out.push(a[i++] as number);
  }
  return [...out, ...a.slice(i), ...b.slice(j)];
};

/** Their __addPoly: sums two coefficient columns, padding the shorter at the top. */
const addPoly = (c1: number[], c2: number[]): number[] => {
  if (c1.length < c2.length) return addPoly(c2, c1);
  const padded = [...new Array<number>(c1.length - c2.length).fill(0), ...c2];
  return c1.map((value, i) => value + (padded[i] as number));
};

/** Their __mulPoly. */
const mulPoly = (c1: number[], c2: number[]): number[] => {
  const newc = new Array<number>(c1.length + c2.length - 1).fill(0);
  [...c1].reverse().forEach((v1, i) => {
    [...c2].reverse().forEach((v2, j) => {
      newc[newc.length - 1 - (i + j)] = (newc[newc.length - 1 - (i + j)] as number) + v1 * v2;
    });
  });
  return newc;
};

/** Appends a column to newc, padding it at the top with zeros (zip truncates as Python's does). */
const appendColumn = (newc: number[][], poly: number[]): number[][] => {
  const padded = [...new Array<number>(Math.max(newc.length - poly.length, 0)).fill(0), ...poly];
  return newc.map((row, i) => (i < padded.length ? [...row, padded[i] as number] : row)).slice(0, Math.min(newc.length, padded.length));
};

/** Their __insertPoly: the outer piece at x with the powers of the inner function inserted. */
const insertPoly = (x: number, outer: PPoly, otherpows: PPoly[]): number[] => {
  let result: number[] = [];
  const coefs = column(outer.piece((otherpows[1] as PPoly).at(x)).c, 0).reverse();
  coefs.forEach((coef, i) => {
    const relevant = column((otherpows[i] as PPoly).piece(x).c, 0);
    const padded = [...new Array<number>(Math.max(relevant.length - result.length, 0)).fill(0), ...result];
    result = padded.map((value, k) => value + coef * (relevant[k] ?? 0));
    if (relevant.length < padded.length) {
      // NumPy broadcasting needs equal lengths; theirs always has them.
      throw new Error("Unexpected polynomial lengths in composition.");
    }
  });
  return result;
};

/** Their _equal_coefficients. */
const equalCoefficients = (a: number[], b: number[]): boolean => {
  if (a.length === b.length) return a.every((value, i) => value === b[i]);
  if (a.length < b.length) [a, b] = [b, a];
  const extra = a.length - b.length;
  return a.slice(0, extra).every((value) => value === 0) && a.slice(extra).every((value, i) => value === b[i]);
};

/** SciPy's fix_continuity, in BottleMod's version (pieces in x itself). */
const fixContinuity = (c: Coefficients, x: number[], order: number): void => {
  if (order < 0) throw new Error("Order of derivative cannot be negative");
  for (let ip = 1; ip < x.length - 1; ip++) {
    const xval = x[ip] as number;
    const interval = ip - 1;
    for (let dx = order; dx >= 0; dx--) {
      let res = evaluatePoly1(xval, c, interval, dx);
      for (let kp = 0; kp < dx; kp++) res /= kp + 1;
      (c[c.length - dx - 1] as number[])[ip] = res;
    }
  }
};

/** SciPy's real_roots, in BottleMod's version, for one polynomial (extrapolating). */
const realRoots = (c: Coefficients, x: number[], y: number, reportDiscont: boolean): number[] => {
  if (c.length === 0) return [];
  const pieces = c[0]?.length ?? 0;
  const ascending = (lastOf(x) as number) >= (x[0] as number);
  const roots: number[] = [];
  let lastRoot = Number.NaN;
  for (let interval = 0; interval < pieces; interval++) {
    if (interval > 0 && reportDiscont) {
      // As in their _ppoly.pyx: the next piece is evaluated at x[interval - 1].
      const va = evaluatePoly1(x[interval] as number, c, interval - 1, 0) - y;
      const vb = evaluatePoly1(x[interval - 1] as number, c, interval, 0) - y;
      if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) {
        if (x[interval] !== lastRoot) {
          lastRoot = x[interval] as number;
          roots.push(lastRoot);
        }
      }
    }
    const { identicallyZero, roots: found } = realRootsOfPiece(c, y, interval);
    if (identicallyZero) {
      if (x[interval] === x[interval + 1]) {
        if (x[interval] !== lastRoot) {
          lastRoot = x[interval] as number;
          roots.push(lastRoot);
        }
      } else {
        roots.push(x[interval] as number, Number.NaN);
        lastRoot = Number.NaN;
      }
      continue;
    }
    for (let root of found) {
      // One Newton step, as SciPy refines LAPACK's roots.
      const f = evaluatePoly1(root, c, interval, 0) - y;
      const df = evaluatePoly1(root, c, interval, 1);
      if (df !== 0) {
        const dx = f / df;
        if (Math.abs(dx) < Math.abs(root)) root = root - dx;
      }
      const lo = x[interval] as number;
      const hi = x[interval + 1] as number;
      if (interval === 0) {
        if (interval !== pieces - 1 && ((ascending && !(root <= hi)) || (!ascending && !(root >= hi)))) continue;
      } else if (interval === pieces - 1) {
        if ((ascending && !(root >= lo)) || (!ascending && !(root <= lo))) continue;
      } else if ((ascending && !(lo <= root && root <= hi)) || (!ascending && !(hi <= root && root <= lo))) continue;
      if (root !== lastRoot) {
        lastRoot = root;
        roots.push(root);
      }
    }
  }
  return roots;
};

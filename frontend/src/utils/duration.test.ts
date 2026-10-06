import { describe, expect, it } from "vitest";
import { isoDurationToMinutes, minutesToIsoDuration } from "./duration";

describe("ISO duration helpers", () => {
  it.each([
    ["PT30M", 30],
    ["PT2H", 120],
    ["PT1H30M", 90],
    ["P1D", 1440],
    ["PT90S", 2],
    ["pt6h", 360],
    ["", 0],
    [undefined, 0],
    ["P", 0],
    ["30 minutes", 0],
  ])("%s -> %s minutes", (duration, minutes) => {
    expect(isoDurationToMinutes(duration)).toBe(minutes);
  });

  it.each([
    [30, "PT30M"],
    [120, "PT2H"],
    [90, "PT1H30M"],
    [0, ""],
    [-5, ""],
  ])("%s minutes -> %s", (minutes, duration) => {
    expect(minutesToIsoDuration(minutes)).toBe(duration);
  });

  it("round-trips whole minutes", () => {
    for (const minutes of [1, 59, 60, 61, 1440]) {
      expect(isoDurationToMinutes(minutesToIsoDuration(minutes))).toBe(minutes);
    }
  });
});

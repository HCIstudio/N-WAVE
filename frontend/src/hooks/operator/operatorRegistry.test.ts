import { describe, expect, it } from "vitest";
import {
  getOperatorHook,
  getRegisteredOperatorTypes,
  isOperatorTypeRegistered,
  registerOperatorHook,
} from "./operatorRegistry";
import { useFilterOperator } from "./useFilterOperator";
import { useMapOperator } from "./useMapOperator";
import { useMergeOperator } from "./useMergeOperator";

describe("operatorRegistry", () => {
  it("finds the preview hooks of the built-in operators", () => {
    expect(getOperatorHook("filter")).toBe(useFilterOperator);
    expect(getOperatorHook("map")).toBe(useMapOperator);
    expect(getOperatorHook("merge")).toBe(useMergeOperator);
    expect(getRegisteredOperatorTypes()).toEqual(
      expect.arrayContaining(["filter", "map", "merge"]),
    );
  });

  it("knows nothing about unknown operators", () => {
    expect(getOperatorHook("sort")).toBeNull();
    expect(isOperatorTypeRegistered("sort")).toBe(false);
  });

  it("registers new operators and overrides built-in ones", () => {
    const sort = () => null;
    const filter = () => null;
    registerOperatorHook("sort", sort);
    registerOperatorHook("filter", filter);
    expect(getOperatorHook("sort")).toBe(sort);
    expect(getOperatorHook("filter")).toBe(filter);
    expect(isOperatorTypeRegistered("sort")).toBe(true);
    const types = getRegisteredOperatorTypes();
    expect(types.filter((type) => type === "filter")).toHaveLength(1);
    expect(types).toContain("sort");
  });
});

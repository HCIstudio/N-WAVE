import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest `value`. Effects can read
 * `ref.current` to call the newest callback (or see the newest data) without
 * listing it as a dependency, so they don't re-run every time a parent passes
 * a new function identity. The ref is updated in a layout effect, which runs
 * before any passive effect of the same commit.
 */
export const useLatestRef = <T>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

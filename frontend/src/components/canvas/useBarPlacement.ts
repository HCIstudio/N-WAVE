// Where the bottom bar goes: in the bottom row, centred between the canvas
// controls (left) and the Runs bar (right), or, when it doesn't fit there,
// one row up, right-aligned above the Runs bar, so it covers neither.

import { type RefObject, useLayoutEffect, useState } from "react";

const GAP = 8;

export type BarPlacement = { row: "bottom"; center: number } | { row: "above" };

export const useBarPlacement = (bar: RefObject<HTMLElement | null>): BarPlacement => {
  const [placement, setPlacement] = useState<BarPlacement>({ row: "bottom", center: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const element = bar.current;
      if (!element) return;
      const left = document.querySelector("[data-canvas-controls]")?.getBoundingClientRect().right ?? 0;
      const right = document.querySelector('section[aria-label="Runs"]')?.getBoundingClientRect().left ?? window.innerWidth;
      const room = right - left - 2 * GAP;
      const next: BarPlacement =
        element.offsetWidth <= room ? { row: "bottom", center: Math.round((left + right) / 2) } : { row: "above" };
      setPlacement((current) =>
        current.row === next.row && (current.row === "above" || (next.row === "bottom" && current.center === next.center))
          ? current
          : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    // Not in every environment (tests); the window's resize still counts.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    if (bar.current) observer?.observe(bar.current);
    const runs = document.querySelector('section[aria-label="Runs"]');
    if (runs) observer?.observe(runs);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [bar]);

  return placement;
};

import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_NODE_SIZE, findFreePosition } from "./nodePlacement";

const node = (x: number, y: number, width = 280, height = 240): Node => ({
  id: `${x},${y}`,
  position: { x, y },
  measured: { width, height },
  data: {},
});

describe("findFreePosition", () => {
  it("keeps the desired spot when nothing is there", () => {
    expect(findFreePosition({ x: 0, y: 0 }, [node(1000, 1000)])).toEqual({ x: 0, y: 0 });
  });

  it("moves right of a node that is in the way", () => {
    const spot = findFreePosition({ x: 10, y: 10 }, [node(0, 0)]);
    expect(spot).toEqual({ x: 10 + DEFAULT_NODE_SIZE.width + 40, y: 10 });
  });

  it("skips several nodes in a row, and unmeasured nodes count with a default size", () => {
    const row = [node(0, 0), node(320, 0), { ...node(640, 0), measured: undefined }];
    const spot = findFreePosition({ x: 0, y: 0 }, row);
    expect(spot.x).toBeGreaterThanOrEqual(640 + DEFAULT_NODE_SIZE.width + 40);
    expect(spot.y).toBe(0);
  });

  it("never returns a spot that overlaps", () => {
    const crowd = Array.from({ length: 30 }, (_, i) => node((i % 10) * 300, Math.floor(i / 10) * 260));
    const spot = findFreePosition({ x: 100, y: 100 }, crowd);
    const box = { ...spot, ...DEFAULT_NODE_SIZE };
    for (const other of crowd) {
      const apart =
        box.x >= other.position.x + 280 ||
        other.position.x >= box.x + box.width ||
        box.y >= other.position.y + 240 ||
        other.position.y >= box.y + box.height;
      expect(apart).toBe(true);
    }
  });
});

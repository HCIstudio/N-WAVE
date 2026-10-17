import type { Node } from "@xyflow/react";

/** Size assumed for a node React Flow hasn't measured yet (a new node). */
export const DEFAULT_NODE_SIZE = { width: 280, height: 240 };
const GAP = 40;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxOf = (node: Node): Box => ({
  x: node.position.x,
  y: node.position.y,
  width: node.measured?.width ?? DEFAULT_NODE_SIZE.width,
  height: node.measured?.height ?? DEFAULT_NODE_SIZE.height,
});

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width + GAP &&
  b.x < a.x + a.width + GAP &&
  a.y < b.y + b.height + GAP &&
  b.y < a.y + a.height + GAP;

/**
 * Where to put a new node: `desired` if it's free, otherwise the nearest
 * free spot, trying to the right first (workflows read left to right),
 * then rows below and above. Notes count as obstacles too.
 */
export const findFreePosition = (
  desired: { x: number; y: number },
  nodes: Node[],
  size = DEFAULT_NODE_SIZE,
): { x: number; y: number } => {
  const others = nodes.map(boxOf);
  const stepX = size.width + GAP;
  const stepY = size.height + GAP;
  for (const row of [0, 1, -1, 2, -2, 3]) {
    for (let column = 0; column < 8; column++) {
      const candidate = {
        x: desired.x + column * stepX,
        y: desired.y + row * stepY,
      };
      const box = { ...candidate, ...size };
      if (!others.some((other) => overlaps(box, other))) return candidate;
    }
  }
  return desired;
};

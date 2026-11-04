import { renderHook } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import { recorded, startRecording, stopRecording } from "../activity/activityTesting";
import type { NodeData } from "../components/nodes/BaseNode";
import type { WorkflowAnalysis } from "./analysis";
import type { BioflowResult } from "./bioflow";
import { useStepConditions } from "./useStepConditions";

afterEach(stopRecording);

const result = {
  steps: [
    { id: "STAR", name: "STAR", subworkflow: null, conditions: ["params.aligner == 'star'"] },
    { id: "HISAT2", name: "HISAT2", subworkflow: null, conditions: ["params.aligner == 'hisat2'"] },
  ],
  subworkflows: [],
} as unknown as BioflowResult;
const analysis = {
  names: new Map([
    ["n-star", "STAR"],
    ["n-hisat2", "HISAT2"],
  ]),
  bioflow: { status: "done", result },
} as unknown as WorkflowAnalysis;
const withAligner = (aligner: string) =>
  [
    {
      id: "p",
      type: "parameters",
      position: { x: 0, y: 0 },
      data: { label: "Parameters", parameters: [{ name: "aligner", type: "text", value: aligner }] },
    },
  ] as unknown as Node<NodeData>[];

describe("useStepConditions", () => {
  it("follows the Parameters node's values, and records which steps won't run", () => {
    startRecording();
    const { result: hook, rerender } = renderHook(({ nodes }) => useStepConditions({ analysis, structureCurrent: true }, nodes, true), {
      initialProps: { nodes: withAligner("star") },
    });
    expect(hook.current["n-hisat2"].runs).toBe(false);
    expect(hook.current["n-star"].runs).toBe(true);
    rerender({ nodes: withAligner("hisat2") });
    expect(hook.current["n-star"].runs).toBe(false);
    expect(recorded("conditions.preview").map((event) => event.data)).toEqual([
      { notRunning: ["n-hisat2"], conditional: 2 },
      { notRunning: ["n-star"], conditional: 2 },
    ]);
  });

  it("shows nothing when off, or once the steps changed since the analysis", () => {
    const nodes = withAligner("star");
    expect(renderHook(() => useStepConditions({ analysis, structureCurrent: true }, nodes, false)).result.current).toEqual({});
    expect(renderHook(() => useStepConditions({ analysis, structureCurrent: false }, nodes, true)).result.current).toEqual({});
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RunStage } from "../../../execution/runStages";
import StageProgress from "./StageProgress";

const stages: RunStage[] = [
  { id: "qc", label: "FastQC", status: "succeeded", done: 4, total: 4 },
  { id: "cache", label: "Index", status: "cached", done: 1, total: 1 },
  { id: "trim", label: "Trim", status: "running", done: 1, total: 4 },
  { id: "align", label: "Align", status: "waiting", done: 0, total: 0 },
];

describe("StageProgress", () => {
  it("shows a segment per step, with how many of its tasks finished", () => {
    render(<StageProgress stages={stages} isRunning />);
    const bar = screen.getByRole("list", { name: "Steps: 2 done · 1 running · 1 waiting" });
    const segments = Array.from(bar.querySelectorAll("li"));
    expect(segments.map((segment) => segment.getAttribute("data-status"))).toEqual([
      "succeeded",
      "cached",
      "running",
      "waiting",
    ]);
    expect(segments[2].getAttribute("aria-label")).toBe("Trim: running, 1 of 4 tasks finished");
    expect(segments[3].getAttribute("aria-label")).toBe("Align: waiting");
  });

  it("calls steps that never started 'not run' once the run is over", () => {
    render(<StageProgress stages={[{ ...stages[3] }, { ...stages[0], status: "failed", done: 3 }]} isRunning={false} />);
    expect(screen.getByText("1 failed · 1 not run")).toBeTruthy();
  });

  it("shows nothing without steps", () => {
    const { container } = render(<StageProgress stages={[]} isRunning />);
    expect(container.innerHTML).toBe("");
  });
});

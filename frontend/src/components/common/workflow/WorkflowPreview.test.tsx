import { armStyle } from "../../../branches/armStyles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WorkflowEdge, WorkflowNode } from "../../../types/backend";
import { NODE_KINDS } from "../../../workflows/nodeKinds";
import NodeKindLegend from "./NodeKindLegend";
import WorkflowPreview from "./WorkflowPreview";

const node = (id: string, type: string, data: Record<string, unknown> = {}, x = 0) =>
  ({ id, type, position: { x, y: 0 }, data }) as unknown as WorkflowNode;

describe("WorkflowPreview", () => {
  it("draws each node in its kind's color and shape, without notes", () => {
    const { container } = render(
      <WorkflowPreview
        nodes={[
          node("in", "fileInput"),
          node("qc", "process", { processType: "nfcore_fastqc" }, 200),
          node("map", "operator", {}, 400),
          node("tool", "process", { processType: "my_tool" }, 600),
          node("out", "outputDisplay", {}, 800),
          node("n", "note", {}, 1000),
        ]}
        edges={[{ id: "e", source: "in", target: "qc" } as WorkflowEdge]}
      />,
    );
    const rects = [...container.querySelectorAll("rect")];
    expect(rects.map((rect) => rect.dataset.kind)).toEqual(["input", "nfcore", "operator", "custom", "output"]);
    const [input, nfcore, operator, custom, output] = rects;
    expect(input.getAttribute("fill")).toBe(NODE_KINDS.input.color);
    expect(input.getAttribute("rx")).toBe("45");
    expect(nfcore.getAttribute("fill")).toBe(NODE_KINDS.nfcore.color);
    expect(custom.getAttribute("fill")).toBe("none");
    expect(custom.getAttribute("stroke")).toBe(NODE_KINDS.custom.color);
    expect(operator.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(output.getAttribute("fill")).toBe("none");
    expect(Number(output.getAttribute("rx"))).toBeGreaterThan(12);
  });

  it("draws a dashed line from a Branch to each step in its arms, in the arm's color", () => {
    const branch = node("b", "branch", { conditions: ["params.trim"] });
    const star = node("s", "process", { branch: { id: "b", arm: "if" } }, 300);
    const hisat = node("h", "process", { branch: { id: "b", arm: "else" } }, 300);
    // In the arm of a branch that is gone: no line.
    const loose = node("x", "process", { branch: { id: "gone", arm: "if" } }, 600);
    const { container } = render(<WorkflowPreview nodes={[branch, star, hisat, loose]} edges={[]} />);
    const arms = [...container.querySelectorAll("path[data-arm]")];
    expect(arms.map((path) => path.getAttribute("data-arm"))).toEqual(["if", "else"]);
    expect(arms.map((path) => path.getAttribute("stroke"))).toEqual([armStyle("if").line, armStyle("else").line]);
    expect(arms.every((path) => path.getAttribute("stroke-dasharray"))).toBe(true);
  });

  it("says when there is nothing to draw", () => {
    render(<WorkflowPreview nodes={[node("n", "note")]} edges={[]} />);
    expect(screen.getByText("No nodes yet")).toBeTruthy();
  });
});

describe("NodeKindLegend", () => {
  it("names the kinds and explains them on hover", () => {
    render(<NodeKindLegend />);
    const legend = screen.getByRole("list", { name: "Node kinds" });
    expect(legend.textContent).toBe("Inputsnf-core stepsCustom stepsText stepsOperatorsLogicOutputs");
    expect(screen.getByText("Inputs").closest("li")?.title).toContain("File Input");
  });
});

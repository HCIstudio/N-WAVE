import { render, screen } from "@testing-library/react";
import { type Node, type NodeProps, ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import BaseNode, { type NodeData } from "./BaseNode";

const show = (data: Partial<NodeData>, extra: Partial<NodeProps<Node<NodeData>>> = {}) =>
  render(
    <ReactFlowProvider>
      <BaseNode
        {...({ id: "n1", type: "process", selected: false, ...extra } as NodeProps<Node<NodeData>>)}
        data={{ label: "Trim", ...data } as NodeData}
      />
    </ReactFlowProvider>,
  );

describe("BaseNode", () => {
  it("says what kind of node it is on its top strip", () => {
    const { container } = show({});
    expect(container.querySelector('[data-kind="step"]')?.textContent).toBe("Step");
  });

  it("marks a step that ran without errors with a label, not a green border", () => {
    const { container } = show({ status: "success" } as Partial<NodeData>);
    expect(screen.getByRole("status", { name: "Last run: succeeded" }).textContent).toBe("Done");
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toMatch(/border-green|bg-green/);
  });

  it("is outlined in blue when selected", () => {
    const { container } = show({}, { selected: true });
    expect((container.firstElementChild as HTMLElement).className).toContain("ring-blue-500");
  });
});

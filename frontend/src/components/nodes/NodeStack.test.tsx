import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NodeStack, { STACK_BORDER } from "./NodeStack";

describe("NodeStack", () => {
  it("draws two cards behind the node, evenly down and to the right, with the node's border", () => {
    const { container } = render(<NodeStack tone="error" />);
    const cards = Array.from(container.querySelectorAll("div"));
    expect(cards).toHaveLength(2);
    // The deeper card first, so the nearer one is drawn over it.
    expect(cards[0].className).toContain("translate-x-3 translate-y-3");
    expect(cards[1].className).toContain("translate-x-1.5 translate-y-1.5");
    for (const card of cards) {
      expect(card.classList.contains("border-2")).toBe(true);
      expect(card.classList.contains(STACK_BORDER.error)).toBe(true);
    }
    expect(screen.getByTestId("node-stack").getAttribute("data-tone")).toBe("error");
  });
});

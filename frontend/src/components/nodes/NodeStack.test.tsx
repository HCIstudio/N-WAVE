import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NodeStack from "./NodeStack";

describe("NodeStack", () => {
  it("draws two cards behind the node, evenly lower, in the node's state color", () => {
    const { container } = render(<NodeStack tone="error" />);
    const cards = Array.from(container.querySelectorAll("div"));
    expect(cards).toHaveLength(2);
    // The deeper card first, so the nearer one is drawn over it.
    expect(cards[0].className).toContain("translate-y-3");
    expect(cards[1].className).toContain("translate-y-1.5");
    for (const card of cards) expect(card.className).toContain("border-red-500");
    expect(screen.getByTestId("node-stack").getAttribute("data-tone")).toBe("error");
  });
});

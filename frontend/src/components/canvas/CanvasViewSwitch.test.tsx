import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasViewSwitch from "./CanvasViewSwitch";

describe("CanvasViewSwitch", () => {
  it("always shows all three views; Groups is greyed out without groups", () => {
    const onChange = vi.fn();
    render(<CanvasViewSwitch view="all" onChange={onChange} />);
    for (const name of ["Editor", "Process graph", "Groups"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    const groups = screen.getByRole("button", { name: "Groups" }) as HTMLButtonElement;
    expect(groups.disabled).toBe(true);
    expect(groups.title).toMatch(/^No groups yet/);
    fireEvent.click(screen.getByRole("button", { name: "Process graph" }));
    expect(onChange).toHaveBeenCalledWith("steps");
  });

  it("opens Groups once the workflow has a group", () => {
    const onChange = vi.fn();
    render(<CanvasViewSwitch view="all" onChange={onChange} hasGroups />);
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(onChange).toHaveBeenCalledWith("grouped");
  });
});

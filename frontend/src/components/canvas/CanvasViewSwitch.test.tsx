import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasViewSwitch from "./CanvasViewSwitch";

describe("CanvasViewSwitch", () => {
  it("offers the editor and the two graph views of the code", () => {
    const onChange = vi.fn();
    render(<CanvasViewSwitch view="editor" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Editor" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Specification" }));
    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }));
    expect(onChange.mock.calls).toEqual([["specification"], ["dependencies"]]);
    expect(screen.getByRole("button", { name: "Dependencies" }).title).toMatch(/^Process dependency graph \(read-only\)/);
  });

  it("greys the graph views out where they can't be drawn, and still opens them to say why", () => {
    const onChange = vi.fn();
    render(<CanvasViewSwitch view="editor" onChange={onChange} graphsUnavailable="Needs a full install." />);
    const graph = screen.getByRole("button", { name: /^Specification/ });
    expect(graph.getAttribute("data-unavailable")).toBe("true");
    expect(graph.textContent).toBe("Specification (not available here)");
    expect(graph.title).toMatch(/Needs a full install\.$/);
    expect(screen.getByRole("button", { name: "Editor" }).getAttribute("data-unavailable")).toBeNull();
    fireEvent.click(graph);
    expect(onChange).toHaveBeenCalledWith("specification");
  });
});

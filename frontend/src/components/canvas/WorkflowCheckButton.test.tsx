import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkflowCheckButton, { type CheckProblem } from "./WorkflowCheckButton";

const problems: CheckProblem[] = [
  { id: "a", level: "error", message: "Add a file to “Reads”.", nodeId: "reads" },
  { id: "b", level: "warning", message: "The run asks for too much memory." },
];

const show = (list = problems, withServer = true) => {
  const onShowNode = vi.fn();
  const onRecheck = withServer ? vi.fn() : undefined;
  render(
    <WorkflowCheckButton
      problems={list}
      nodeLabels={{ reads: "Reads" }}
      onShowNode={onShowNode}
      onRecheck={onRecheck}
      isChecking={false}
    />,
  );
  return { onShowNode, onRecheck };
};

describe("WorkflowCheckButton", () => {
  it("sums up the problems", () => {
    show();
    expect(
      screen.getByRole("button", {
        name: "Workflow check: 1 problem to fix before running, 1 warning",
      }),
    ).toBeTruthy();
  });

  it("lists them, shows a problem's node and closes", () => {
    const { onShowNode } = show();
    fireEvent.click(screen.getByRole("button", { name: /^Workflow check/ }));
    const list = screen.getByRole("region", { name: "Workflow check" });
    expect(list.textContent).toContain("Add a file to “Reads”.");
    expect(list.textContent).toContain("The run asks for too much memory.");
    fireEvent.click(screen.getByRole("button", { name: "Show “Reads”" }));
    expect(onShowNode).toHaveBeenCalledWith("reads");
    expect(screen.queryByRole("region", { name: "Workflow check" })).toBeNull();
  });

  it("closes on Escape and asks the server again on request", () => {
    const { onRecheck } = show();
    fireEvent.click(screen.getByRole("button", { name: /^Workflow check/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onRecheck).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Workflow check" })).toBeNull();
  });

  it("says when there is nothing to fix, without a server to ask", () => {
    show([], false);
    fireEvent.click(screen.getByRole("button", { name: "Workflow check: No problems found" }));
    expect(screen.getByText(/the workflow is ready to run/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });

  it("says problems only warn when the check doesn't block the run", () => {
    render(
      <WorkflowCheckButton
        problems={problems}
        nodeLabels={{ reads: "Reads" }}
        onShowNode={vi.fn()}
        isChecking={false}
        blocking={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Workflow check: 1 problem, 1 warning" }));
    expect(screen.getByText(/you can run anyway/)).toBeTruthy();
  });
});

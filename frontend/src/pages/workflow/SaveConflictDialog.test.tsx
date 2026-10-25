import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SaveConflictDialog from "./SaveConflictDialog";

describe("SaveConflictDialog", () => {
  it("says nothing was overwritten and offers each version", () => {
    const handlers = {
      onReload: vi.fn(),
      onSaveAsCopy: vi.fn(),
      onOverwrite: vi.fn(),
      onClose: vi.fn(),
    };
    render(<SaveConflictDialog isOpen workflowName="My flow" {...handlers} />);
    expect(
      screen.getByRole("dialog", { name: "This workflow was changed elsewhere" })
        .textContent,
    ).toContain("nothing was overwritten");
    fireEvent.click(screen.getByRole("button", { name: "Load the saved version" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep mine as a copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace it with mine" }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(handlers.onReload).toHaveBeenCalledOnce();
    expect(handlers.onSaveAsCopy).toHaveBeenCalledOnce();
    expect(handlers.onOverwrite).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});

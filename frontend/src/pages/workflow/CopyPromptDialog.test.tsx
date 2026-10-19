import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CopyPromptDialog from "./CopyPromptDialog";

describe("CopyPromptDialog", () => {
  const renderDialog = () => {
    const onCopy = vi.fn();
    const onJustLook = vi.fn();
    render(
      <CopyPromptDialog
        isOpen
        workflowName="Demo 1"
        onCopy={onCopy}
        onJustLook={onJustLook}
      />,
    );
    return { onCopy, onJustLook };
  };

  it("says the example can't be changed and offers a copy", () => {
    const { onCopy } = renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Make your own copy to edit" })
        .textContent,
    ).toContain("“Demo 1” is an example");
    fireEvent.click(screen.getByRole("button", { name: "Make a copy" }));
    expect(onCopy).toHaveBeenCalled();
  });

  it("just looks when the user says so or closes it", () => {
    const { onCopy, onJustLook } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Just look" }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onJustLook).toHaveBeenCalledTimes(2);
    expect(onCopy).not.toHaveBeenCalled();
  });
});

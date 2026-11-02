import { fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import CustomControls from "./CustomControls";

const show = (props: React.ComponentProps<typeof CustomControls>) =>
  render(
    <ReactFlowProvider>
      <CustomControls {...props} />
    </ReactFlowProvider>,
  );

describe("CustomControls", () => {
  it("has no minimap button: Global Settings → Features switches the minimap", () => {
    show({});
    expect(screen.queryByRole("button", { name: "Minimap" })).toBeNull();
  });

  it("zooms to the failing step only when one failed", () => {
    const { unmount } = show({});
    expect(screen.queryByRole("button", { name: "Zoom to the failing step" })).toBeNull();
    expect(screen.getByRole("button", { name: "Fit view" }).getAttribute("title")).toBe("Zoom to fit the whole workflow");
    unmount();
    const onZoomToFailed = vi.fn();
    show({ onZoomToFailed });
    fireEvent.click(screen.getByRole("button", { name: "Zoom to the failing step" }));
    expect(onZoomToFailed).toHaveBeenCalled();
  });
});

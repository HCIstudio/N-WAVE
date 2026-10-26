import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NodePackImportOptions } from "../../api/nodePacks";

const importPackNodes = vi.fn();
vi.mock("../../api/nodePacks", () => ({
  importPackNodes: (...args: unknown[]) => importPackNodes(...args),
}));

const { default: MissingNfCoreBanner } = await import("./MissingNfCoreBanner");

describe("MissingNfCoreBanner", () => {
  it("shows what it installs and can be cancelled", async () => {
    let options: NodePackImportOptions = {};
    let finish: () => void = () => {};
    importPackNodes.mockImplementation(
      (_nodes: unknown, _missing: unknown, given: NodePackImportOptions) =>
        new Promise((resolve) => {
          options = given;
          given.onInstalling?.("nf-core/fastqc", 1, 2);
          finish = () =>
            resolve({ saved: [], installedComponents: [], failures: [], cancelled: true });
        }),
    );
    const onInstalled = vi.fn();
    render(
      <MissingNfCoreBanner
        components={["nf-core/fastqc", "nf-core/multiqc"]}
        onInstalled={onInstalled}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Install them" }));
    expect(await screen.findByText("Installing nf-core/fastqc (1 of 2)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(options.signal?.aborted).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole("alert").textContent).toContain("Installing was cancelled");
    expect(screen.getByRole("button", { name: "Install them" })).toBeTruthy();
    expect(onInstalled).toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RunCacheSettings from "./RunCacheSettings";

describe("RunCacheSettings", () => {
  it("shows the cache size and clears it after asking", async () => {
    const onClear = vi.fn();
    render(<RunCacheSettings cache={{ bytes: 3 * 1024 * 1024, folders: 2 }} onClear={onClear} />);
    expect(screen.getByTestId("run-cache-size").textContent).toBe("3.0 MB in 2 run folders");
    await userEvent.click(screen.getByRole("button", { name: "Clear cache" }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear cache" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("can't clear an empty cache, or one a run is using", () => {
    const { rerender } = render(<RunCacheSettings cache={{ bytes: 0, folders: 0 }} onClear={vi.fn()} />);
    expect(screen.getByTestId("run-cache-size").textContent).toContain("Empty");
    expect((screen.getByRole("button", { name: "Clear cache" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<RunCacheSettings cache={{ bytes: 10, folders: 1 }} onClear={vi.fn()} isRunning error="Busy" />);
    expect((screen.getByRole("button", { name: "Clear cache" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Busy");
    rerender(<RunCacheSettings cache={null} onClear={vi.fn()} />);
    expect(screen.getByTestId("run-cache-size").textContent).toContain("Save the workflow");
  });
});

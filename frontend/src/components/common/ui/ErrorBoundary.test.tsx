import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

// Tell React this environment supports act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let shouldThrow = true;
const Flaky = () => {
  if (shouldThrow) throw new Error("boom");
  return <p>recovered</p>;
};

describe("ErrorBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    shouldThrow = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // React logs caught render errors; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    shouldThrow = false;
    act(() =>
      root.render(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      )
    );
    expect(container.textContent).toBe("recovered");
  });

  it("shows the fallback with the error and recovers on retry", () => {
    act(() =>
      root.render(
        <ErrorBoundary title="Canvas crashed">
          <Flaky />
        </ErrorBoundary>
      )
    );

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("Canvas crashed");
    expect(container.textContent).toContain("boom");

    shouldThrow = false;
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again"
    );
    act(() => retry?.click());

    expect(container.textContent).toBe("recovered");
  });
});

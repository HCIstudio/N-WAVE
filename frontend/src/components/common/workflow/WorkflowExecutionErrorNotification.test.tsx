import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkflowExecutionErrorNotification from "./WorkflowExecutionErrorNotification";

type Props = React.ComponentProps<typeof WorkflowExecutionErrorNotification>;

const show = (props: Partial<Props> = {}) => {
  const all: Props = {
    isVisible: true,
    onClose: vi.fn(),
    onRetry: vi.fn(async () => {}),
    error: { message: "Something broke" },
    ...props,
  };
  return { ...render(<WorkflowExecutionErrorNotification {...all} />), all };
};

const suggestionsFor = (message: string) => {
  const { unmount } = show({ error: { message } });
  const heading = screen.getByText("Suggested Fixes");
  const list = heading.closest("div")?.querySelectorAll("p") ?? [];
  const texts = Array.from(list, (p) => p.textContent);
  unmount();
  return texts;
};

describe("WorkflowExecutionErrorNotification", () => {
  // fireEvent rather than userEvent: user-event waits on timers, which are fake.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });


  it("explains a recognised failure instead of guessing fixes", () => {
    const onShowStep = vi.fn();
    show({ explanation: {
  kind: "command-not-found" as const,
  title: "A program the step needs isn't installed",
  explanation: "The step runs “fastqc”, which isn't installed where it ran (exit status 127).",
  fix: "Turn on Docker in the execution settings.",
  docs: "https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#command-not-found",
  process: "NFCORE_FASTQC_QC",
}, stepLabel: "FastQC", onShowStep });
    const card = screen.getByRole("region", { name: "Why the run failed" });
    expect(card.textContent).toContain("In “FastQC”: The step runs “fastqc”");
    expect(card.textContent).toContain("Turn on Docker");
    expect(screen.queryByText("Suggested Fixes")).toBeNull();
    expect(screen.getByRole("link", { name: /More about this/ }).getAttribute("href")).toBe(
      "https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#command-not-found",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show “FastQC”" }));
    expect(onShowStep).toHaveBeenCalled();
  });

  it("renders nothing when hidden", () => {
    const { container } = show({ isVisible: false });
    expect(container.innerHTML).toBe("");
  });

  it("shows the error, its output and generic fixes", () => {
    show({ error: { message: "Something broke", output: "line 1\nline 2" } });
    expect(screen.getByText("Workflow Execution Failed")).toBeTruthy();
    expect(screen.getByText("Something broke")).toBeTruthy();
    expect(screen.getByText("Execution Output")).toBeTruthy();
    expect(screen.getByText(/line 1/).textContent).toBe("line 1\nline 2");
    expect(
      screen.getByText("Review workflow configuration and node settings"),
    ).toBeTruthy();
  });

  it("suggests fixes that match the error", () => {
    expect(suggestionsFor("No such file: reads.fq")).toEqual([
      "Verify that all input files are properly uploaded and selected",
      "Check file paths in your File Input nodes",
    ]);
    expect(suggestionsFor("Permission denied")).toContain(
      "Check file permissions on input/output directories",
    );
    expect(suggestionsFor("Out of memory")).toContain(
      "Increase memory allocation in execution settings",
    );
    expect(suggestionsFor("docker daemon not running")).toContain(
      "Verify Docker is installed and running",
    );
    expect(suggestionsFor("samtools: command not found")).toContain(
      "Check that required tools are installed in the environment",
    );
    expect(suggestionsFor("Syntax error at line 3")).toContain(
      "Review Nextflow script syntax",
    );
    expect(suggestionsFor("Network unreachable")).toContain(
      "Check network connectivity",
    );
  });

  it("shows at most four fixes", () => {
    // Matches file, docker and syntax rules: seven suggestions in all.
    expect(
      suggestionsFor("file not found in container: syntax error"),
    ).toHaveLength(4);
  });

  it("collapses and expands the details", () => {
    show();
    const toggle = screen.getByTitle("Collapse details");
    fireEvent.click(toggle);
    expect(screen.getByTitle("Expand details")).toBe(toggle);
    fireEvent.click(toggle);
    expect(screen.getByTitle("Collapse details")).toBe(toggle);
  });

  it("closes from the close button", () => {
    const { all } = show();
    const buttons = screen.getAllByRole("button");
    // The close button is the icon-only one next to the toggle.
    fireEvent.click(buttons[1]);
    expect(all.onClose).toHaveBeenCalledOnce();
  });

  it("opens the full log", () => {
    const onShowLog = vi.fn();
    show({ onShowLog });
    fireEvent.click(screen.getByRole("button", { name: "Show full log" }));
    expect(onShowLog).toHaveBeenCalledOnce();
  });

  it("has no log button without a handler", () => {
    show();
    expect(screen.queryByRole("button", { name: "Show full log" })).toBeNull();
  });

  it("runs again at once from Retry, without waiting for the run", () => {
    const onRetry = vi.fn();
    show({ onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Retrying/)).toBeNull();
  });

  it("offers Resume first when the workflow has a cache", () => {
    const onRetry = vi.fn();
    const onResume = vi.fn();
    show({ onRetry, onResume });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Run again from the start" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("keeps the error up when the retry fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onRetry = vi.fn(async () => {
      throw new Error("still broken");
    });
    const { all } = show({ onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText("Workflow Execution Failed")).toBeTruthy();
    expect(screen.getByText("Suggested Fixes")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(all.onClose).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

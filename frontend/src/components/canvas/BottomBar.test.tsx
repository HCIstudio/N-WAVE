import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionSettings } from "../../types/execution";
import { defaultExecutionSettings } from "../../workflows/defaultExecutionSettings";

// The settings form has its own tests; here it only needs to report a change.
vi.mock("../common/workflow/ExecutionSettings", () => ({
  default: ({
    onSettingsChange,
  }: {
    onSettingsChange: (settings: Partial<ExecutionSettings>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSettingsChange({
          resources: { ...defaultExecutionSettings.resources, maxCpus: 2 },
        })
      }
    >
      Use 2 CPUs
    </button>
  ),
}));

const { default: BottomBar } = await import("./BottomBar");
type Props = React.ComponentProps<typeof BottomBar>;

const show = (props: Partial<Props> = {}) => {
  const all: Props = {
    workflowName: "RNA-seq",
    onWorkflowNameChange: vi.fn(),
    onSave: vi.fn(),
    onDownload: vi.fn(),
    isSaved: false,
    isSaving: false,
    executionSettings: defaultExecutionSettings,
    onExecutionSettingsChange: vi.fn(),
    ...props,
  };
  const view = render(
    <MemoryRouter>
      <BottomBar {...all} />
    </MemoryRouter>,
  );
  return { ...view, all };
};

const button = (name: string) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

describe("BottomBar", () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe("toolbar", () => {
    it("shows the workflow name, or a placeholder", () => {
      const { rerender, all } = show();
      expect(button("RNA-seq")).toBeTruthy();
      rerender(
        <MemoryRouter>
          <BottomBar {...all} workflowName="" />
        </MemoryRouter>,
      );
      expect(button("Untitled Workflow")).toBeTruthy();
      rerender(
        <MemoryRouter>
          <BottomBar {...all} isLoading />
        </MemoryRouter>,
      );
      expect(button("Loading...")).toBeTruthy();
    });

    it("offers Resume next to Run when there is a cache", async () => {
      const onChange = vi.fn();
      const { rerender, all } = show({
        onRun: vi.fn(),
        resume: { available: true, on: true, onChange },
      });
      const toggle = button("Resume");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      await userEvent.click(toggle);
      expect(onChange).toHaveBeenCalledWith(false);
      rerender(
        <MemoryRouter>
          <BottomBar {...all} resume={{ available: false, on: false, onChange }} />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
      rerender(
        <MemoryRouter>
          <BottomBar {...all} isRunning />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    });

        it("links home", () => {
      show();
      expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
        "/",
      );
    });

    it("saves, downloads and exports", async () => {
      const onExportProject = vi.fn();
      const { all } = show({ onExportProject });
      const user = userEvent.setup();
      await user.click(button("Save Workflow"));
      await user.click(button("Download Workflow"));
      await user.click(button("Export Project"));
      expect(all.onSave).toHaveBeenCalledOnce();
      expect(all.onDownload).toHaveBeenCalledOnce();
      expect(onExportProject).toHaveBeenCalledOnce();
    });

    it("disables save when saved or saving", () => {
      const { rerender, all } = show({ isSaved: true });
      expect(button("Save Workflow").disabled).toBe(true);
      rerender(
        <MemoryRouter>
          <BottomBar {...all} isSaved={false} isSaving />
        </MemoryRouter>,
      );
      expect(button("Save Workflow").disabled).toBe(true);
    });

    it("disables export while exporting", () => {
      show({ onExportProject: vi.fn(), isExporting: true });
      expect(button("Export Project").disabled).toBe(true);
    });

    it("hides optional buttons without handlers", () => {
      show();
      expect(screen.queryByRole("button", { name: "Run Workflow" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Show runs" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Export Project" })).toBeNull();
    });

    it("runs with the current settings", async () => {
      const onRun = vi.fn();
      show({ onRun });
      expect(button("Run Workflow").title).toBe("Run with Docker");
      await userEvent.setup().click(button("Run Workflow"));
      expect(onRun).toHaveBeenCalledWith(defaultExecutionSettings);
    });

    it("says it runs locally when Docker is off", () => {
      const local = {
        ...defaultExecutionSettings,
        container: { ...defaultExecutionSettings.container, enabled: false },
      };
      show({ onRun: vi.fn(), executionSettings: local });
      expect(button("Run Workflow").title).toBe("Run locally");
      expect(button("Execution Settings").title).toBe("Local execution");
    });

    it("cannot run while the workflow check finds a problem, and says why", () => {
      show({ onRun: vi.fn(), runBlockedReason: "Can't run yet: add a file." });
      expect(button("Run Workflow").disabled).toBe(true);
      expect(button("Run Workflow").title).toBe("Can't run yet: add a file.");
    });

    it("shows the run panel while running", async () => {
      const onRun = vi.fn();
      const onShowRuns = vi.fn();
      show({ onRun, onShowRuns, isRunning: true });
      expect(screen.queryByRole("button", { name: "Run Workflow" })).toBeNull();
      const user = userEvent.setup();
      await user.click(button("Show the running workflow"));
      await user.click(button("Show runs"));
      expect(onShowRuns).toHaveBeenCalledTimes(2);
      expect(onRun).not.toHaveBeenCalled();
    });
  });

  describe("renaming", () => {
    const startEditing = async () => {
      const user = userEvent.setup();
      await user.dblClick(button("RNA-seq"));
      const input = screen.getByRole("textbox") as HTMLInputElement;
      return { user, input };
    };

    it("renames and saves on Enter", async () => {
      const { all } = show();
      const { user, input } = await startEditing();
      expect(document.activeElement).toBe(input);
      await user.clear(input);
      await user.type(input, "ChIP-seq{Enter}");
      expect(all.onWorkflowNameChange).toHaveBeenCalledWith("ChIP-seq");
      expect(all.onSave).toHaveBeenCalledOnce();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("renames on blur", async () => {
      const { all } = show();
      const { user, input } = await startEditing();
      await user.type(input, " v2");
      fireEvent.blur(input);
      expect(all.onWorkflowNameChange).toHaveBeenCalledWith("RNA-seq v2");
      expect(all.onSave).not.toHaveBeenCalled();
    });

    it("keeps the name on Escape", async () => {
      const { all } = show();
      const { user, input } = await startEditing();
      await user.type(input, " v2{Escape}");
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(all.onWorkflowNameChange).not.toHaveBeenCalled();
    });

    it("does not rename when the name is unchanged", async () => {
      const { all } = show();
      const { user } = await startEditing();
      await user.keyboard("{Enter}");
      expect(all.onWorkflowNameChange).not.toHaveBeenCalled();
      expect(all.onSave).toHaveBeenCalledOnce();
    });
  });

  describe("settings dialog", () => {
    const open = async () => {
      const user = userEvent.setup();
      await user.click(button("Execution Settings"));
      return user;
    };

    it("summarises the settings", async () => {
      show({
        executionSettings: {
          ...defaultExecutionSettings,
          resources: { ...defaultExecutionSettings.resources, maxTime: "PT2H" },
        },
      });
      await open();
      expect(screen.getByRole("heading", { name: "Execution Settings" })).toBeTruthy();
      expect(screen.getByText("Docker execution")).toBeTruthy();
      expect(screen.getByText("ubuntu:22.04")).toBeTruthy();
      expect(screen.getByText(/4 CPU cores,\s*4\.GB/)).toBeTruthy();
      expect(screen.getByText(/PT2H timeout/)).toBeTruthy();
      expect(screen.getByText("Output: results")).toBeTruthy();
    });

    it("falls back to defaults in the summary", async () => {
      const sparse = {
        container: { enabled: false },
        resources: {},
        output: {},
      } as unknown as ExecutionSettings;
      show({ executionSettings: sparse });
      await open();
      expect(screen.getByText("Local execution")).toBeTruthy();
      expect(screen.getByText(/1 CPU cores,\s*2\.GB/)).toBeTruthy();
      expect(screen.getByText(/server default timeout/)).toBeTruthy();
      expect(screen.getByText("Output: results")).toBeTruthy();
    });

    it("closes without asking when nothing changed", async () => {
      show();
      const user = await open();
      expect(button("Saved").disabled).toBe(true);
      await user.click(button("Close"));
      expect(screen.queryByRole("heading", { name: "Execution Settings" })).toBeNull();
    });

    it("closes on a click outside when nothing changed", async () => {
      show();
      await open();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("heading", { name: "Execution Settings" })).toBeNull();
    });

    it("passes changes up and stores them", async () => {
      const { all } = show();
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      const expected = {
        ...defaultExecutionSettings,
        resources: { ...defaultExecutionSettings.resources, maxCpus: 2 },
      };
      expect(all.onExecutionSettingsChange).toHaveBeenCalledWith(expected);
      expect(JSON.parse(localStorage.getItem("executionSettings") ?? "")).toEqual(
        expected,
      );
      expect(button("Save").disabled).toBe(false);
    });

    it("saves the settings", async () => {
      show();
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      await user.click(button("Save"));
      expect(button("Saved").disabled).toBe(true);
      expect(JSON.parse(localStorage.getItem("executionSettings") ?? "")).toEqual(
        defaultExecutionSettings,
      );
      await user.click(button("Close"));
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
    });

    it("asks before closing with unsaved changes", async () => {
      show();
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      await user.click(button("✕"));
      expect(screen.getByText("Unsaved Changes")).toBeTruthy();
      await user.click(button("Close Without Saving"));
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Execution Settings" })).toBeNull();
    });

    it("can save while closing", async () => {
      show();
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      fireEvent.mouseDown(document.body);
      expect(screen.getByText("Unsaved Changes")).toBeTruthy();
      await user.click(button("Save & Close"));
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Execution Settings" })).toBeNull();
      expect(JSON.parse(localStorage.getItem("executionSettings") ?? "")).toEqual(
        defaultExecutionSettings,
      );
    });

    it("asks from the footer Close button too", async () => {
      show();
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      await user.click(button("Close"));
      expect(screen.getByText("Unsaved Changes")).toBeTruthy();
    });

    it("runs and closes", async () => {
      const onRun = vi.fn();
      show({ onRun });
      const user = await open();
      await user.click(button("Use 2 CPUs"));
      await user.click(screen.getByTitle("Run workflow"));
      expect(onRun).toHaveBeenCalledWith(defaultExecutionSettings);
      expect(screen.queryByRole("heading", { name: "Execution Settings" })).toBeNull();
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
    });

    it("cannot run from the dialog while running or blocked by the check", async () => {
      const { rerender, all } = show({ onRun: vi.fn(), isRunning: true });
      await open();
      const running = screen.getByTitle("Workflow is currently running");
      expect((running as HTMLButtonElement).disabled).toBe(true);
      expect(running.textContent).toContain("Running...");
      rerender(
        <MemoryRouter>
          <BottomBar {...all} isRunning={false} runBlockedReason="Can't run yet: add a file." />
        </MemoryRouter>,
      );
      expect(
        (
          screen.getAllByTitle("Can't run yet: add a file.")[0] as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
  });

  describe("settings from storage", () => {
    it("loads stored settings when none are given", () => {
      localStorage.setItem(
        "executionSettings",
        JSON.stringify(defaultExecutionSettings),
      );
      const { all } = show({ executionSettings: {} as ExecutionSettings });
      expect(all.onExecutionSettingsChange).toHaveBeenCalledWith(
        defaultExecutionSettings,
      );
    });

    it("ignores stored settings when some are given", () => {
      localStorage.setItem(
        "executionSettings",
        JSON.stringify(defaultExecutionSettings),
      );
      const { all } = show();
      expect(all.onExecutionSettingsChange).not.toHaveBeenCalled();
    });

    it("ignores unreadable stored settings", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      localStorage.setItem("executionSettings", "{not json");
      const { all } = show({ executionSettings: {} as ExecutionSettings });
      expect(all.onExecutionSettingsChange).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});

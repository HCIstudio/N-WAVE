import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionSettings } from "../../../types/execution";
import { defaultExecutionSettings } from "../../../workflows/defaultExecutionSettings";

const get = vi.fn();
vi.mock("../../../api", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}));

const { default: ExecutionSettingsComponent } = await import(
  "./ExecutionSettings"
);

type Responses = Record<string, unknown>;

const serve = (responses: Responses) =>
  get.mockImplementation(async (url: string) => {
    if (!(url in responses)) throw new Error(`Unexpected ${url}`);
    const data = responses[url];
    if (data instanceof Error) throw data;
    return { data };
  });

const allAvailable: Responses = {
  "/execute/docker-status": { dockerAvailable: true, version: "24.0.7" },
  "/execute/nextflow-status": {
    nextflowAvailable: true,
    dockerNextflowAvailable: true,
    version: "25.04.4",
  },
  "/execute/limits": {
    maxCpus: 16,
    maxMemory: "64.GB",
    defaultTimeoutMinutes: 60,
  },
};

const show = (settings: ExecutionSettings = defaultExecutionSettings) => {
  const onSettingsChange = vi.fn();
  render(
    <ExecutionSettingsComponent
      settings={settings}
      onSettingsChange={onSettingsChange}
    />,
  );
  return onSettingsChange;
};

const withSettings = (
  patch: Partial<{ [K in keyof ExecutionSettings]: Partial<ExecutionSettings[K]> }>,
): ExecutionSettings => {
  const result = { ...defaultExecutionSettings } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    result[key] = {
      ...(defaultExecutionSettings[key as keyof ExecutionSettings] as object),
      ...(value as object),
    };
  }
  return result as unknown as ExecutionSettings;
};

// Waits for the status check first, so its result lands inside the test.
const openTab = async (name: string) => {
  await screen.findByText(/Docker: (Available|Not Available)/);
  await userEvent.setup().click(screen.getByRole("button", { name }));
};

describe("ExecutionSettings", () => {
  beforeEach(() => {
    get.mockReset();
    serve(allAvailable);
  });

  describe("Execution tab", () => {
    it("shows Docker and Nextflow as available", async () => {
      show();
      expect(screen.getByText(/Docker:\s*Checking/)).toBeTruthy();
      expect(
        await screen.findByText("Docker: Available (24.0.7)"),
      ).toBeTruthy();
      expect(
        screen.getByText("Nextflow: Available (Local) (25.04.4)"),
      ).toBeTruthy();
      expect(screen.getByText("✅ Optimal Setup")).toBeTruthy();
    });

    it("explains a Docker-only setup", async () => {
      serve({
        ...allAvailable,
        "/execute/nextflow-status": {
          nextflowAvailable: false,
          dockerNextflowAvailable: true,
        },
      });
      show();
      expect(await screen.findByText("✅ Docker Setup")).toBeTruthy();
      expect(screen.getByText("Nextflow: Available (Docker)")).toBeTruthy();
    });

    it("explains how to start Docker Desktop", async () => {
      serve({
        ...allAvailable,
        "/execute/docker-status": {
          dockerAvailable: false,
          error: "Docker Desktop not running",
          details: "Cannot connect to the Docker daemon",
        },
      });
      show();
      expect(await screen.findByText("⚠️ Limited Setup")).toBeTruthy();
      expect(screen.getByText("Docker: Not Available")).toBeTruthy();
      expect(screen.getByText("Cannot connect to the Docker daemon")).toBeTruthy();
      expect(
        screen.getByText("Launch Docker Desktop from your Start menu"),
      ).toBeTruthy();
    });

    it("reports when the status check fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      serve({
        ...allAvailable,
        "/execute/docker-status": new Error("offline"),
      });
      show();
      expect(
        await screen.findByText("❌ No Execution Environment"),
      ).toBeTruthy();
      expect(screen.getByText("Failed to check Docker status")).toBeTruthy();
      expect(screen.getByText("Nextflow: Not Available")).toBeTruthy();
      expect(screen.queryByText(/To fix this/)).toBeNull();

      await openTab("Advanced");
      expect(screen.getByText("System Issues Detected:")).toBeTruthy();
      expect(
        screen.getByText("Docker: Failed to check Docker status"),
      ).toBeTruthy();
      expect(
        screen.getByText("Nextflow: Failed to check Nextflow status"),
      ).toBeTruthy();
      // Docker is enabled in the settings but not available.
      expect(
        screen.getByText(/Docker execution is enabled but Docker is not/),
      ).toBeTruthy();
      consoleError.mockRestore();
    });

    it("checks the status again on refresh", async () => {
      show();
      await screen.findByText("✅ Optimal Setup");
      const before = get.mock.calls.length;
      await userEvent.setup().click(screen.getByTitle("Refresh status"));
      await screen.findByText("✅ Optimal Setup");
      expect(get.mock.calls.slice(before).map(([url]) => url)).toEqual([
        "/execute/docker-status",
        "/execute/nextflow-status",
      ]);
    });

    it("turns Docker off, keeping the other container settings", async () => {
      const onChange = show();
      await screen.findByText("✅ Optimal Setup");
      await userEvent
        .setup()
        .click(screen.getByLabelText("Enable Docker/Container execution"));
      expect(onChange).toHaveBeenCalledWith({
        container: { ...defaultExecutionSettings.container, enabled: false },
      });
    });

    it("hides the image choice when running locally", async () => {
      show(withSettings({ container: { enabled: false } }));
      await screen.findByText("✅ Optimal Setup");
      expect(screen.queryByLabelText("Default Container Image")).toBeNull();
      expect(screen.getByText(/Processes run locally/)).toBeTruthy();
    });

    it("picks a listed or custom container image", async () => {
      const onChange = show();
      await screen.findByText("✅ Optimal Setup");
      await userEvent
        .setup()
        .selectOptions(
          screen.getByLabelText("Default Container Image"),
          "python:3.11",
        );
      expect(onChange).toHaveBeenLastCalledWith({
        container: {
          ...defaultExecutionSettings.container,
          defaultImage: "python:3.11",
        },
      });
      fireEvent.change(
        screen.getByPlaceholderText("Or enter custom container image..."),
        { target: { value: "quay.io/me/tool:1" } },
      );
      expect(onChange).toHaveBeenLastCalledWith({
        container: {
          ...defaultExecutionSettings.container,
          defaultImage: "quay.io/me/tool:1",
        },
      });
    });
  });

  describe("Output tab", () => {
    const outputWith = (directory: string) => ({
      output: { ...defaultExecutionSettings.output, directory },
    });

    it("stores the directory with forward slashes", async () => {
      const onChange = show();
      await openTab("Output");
      fireEvent.change(screen.getByLabelText("Output Directory"), {
        target: { value: "C:\\Data\\Out" },
      });
      expect(onChange).toHaveBeenCalledWith(outputWith("C:/Data/Out"));
    });

    it("fills in defaults for an unset output section", async () => {
      const settings = { ...defaultExecutionSettings } as Partial<ExecutionSettings>;
      delete settings.output;
      const onChange = show(settings as ExecutionSettings);
      await openTab("Output");
      fireEvent.change(screen.getByLabelText("Output Directory"), {
        target: { value: "out" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        output: { directory: "out", namingPattern: "{workflow_name}_{timestamp}" },
      });
      fireEvent.change(screen.getByLabelText("Output Naming Pattern"), {
        target: { value: "{date}" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        output: { directory: "results", namingPattern: "{date}" },
      });
    });

    it("changes the naming pattern", async () => {
      const onChange = show();
      await openTab("Output");
      fireEvent.change(screen.getByLabelText("Output Naming Pattern"), {
        target: { value: "{workflow_name}" },
      });
      expect(onChange).toHaveBeenCalledWith({
        output: {
          ...defaultExecutionSettings.output,
          namingPattern: "{workflow_name}",
        },
      });
    });

    it("toggles the directory help", async () => {
      show();
      await openTab("Output");
      const toggle = screen.getByRole("button", {
        name: "Need help saving to custom directories?",
      });
      await userEvent.setup().click(toggle);
      expect(screen.getByText("Browser Limitation:")).toBeTruthy();
      await userEvent.setup().click(toggle);
      expect(screen.queryByText("Browser Limitation:")).toBeNull();
    });

    describe("Browse button", () => {
      const browse = () =>
        userEvent
          .setup()
          .click(screen.getByTitle(/Browse for directory/));
      const setPicker = (picker: () => Promise<{ name: string }>) =>
        Object.defineProperty(window, "showDirectoryPicker", {
          value: picker,
          configurable: true,
        });

      afterEach(() => {
        Reflect.deleteProperty(window, "showDirectoryPicker");
        vi.restoreAllMocks();
      });

      it("asks for a path when the browser has no folder picker", async () => {
        const prompt = vi.spyOn(window, "prompt").mockReturnValue(" D:\\Runs ");
        const onChange = show();
        await openTab("Output");
        await browse();
        expect(prompt).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledWith(outputWith("D:/Runs"));
      });

      it("keeps the directory when the path prompt is cancelled", async () => {
        vi.spyOn(window, "prompt").mockReturnValue(null);
        const onChange = show();
        await openTab("Output");
        await browse();
        expect(onChange).not.toHaveBeenCalled();
      });

      it("uses the picked folder's name", async () => {
        const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
        setPicker(async () => ({ name: "my-results" }));
        const onChange = show();
        await openTab("Output");
        await browse();
        await waitFor(() =>
          expect(onChange).toHaveBeenCalledWith(outputWith("my-results")),
        );
        expect(alert.mock.calls[0][0]).toContain("Directory selected: my-results");
      });

      it("calls the root of the picker Downloads", async () => {
        vi.spyOn(window, "alert").mockImplementation(() => {});
        setPicker(async () => ({ name: "." }));
        const onChange = show();
        await openTab("Output");
        await browse();
        await waitFor(() =>
          expect(onChange).toHaveBeenCalledWith(outputWith("Downloads")),
        );
      });

      it("does nothing when the picker is cancelled", async () => {
        const prompt = vi.spyOn(window, "prompt");
        setPicker(async () => {
          throw new DOMException("cancelled", "AbortError");
        });
        const onChange = show();
        await openTab("Output");
        await browse();
        expect(prompt).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
      });

      it("offers a manual path for a blocked system folder", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        vi.spyOn(window, "prompt").mockReturnValue("C:\\Windows\\Out");
        setPicker(async () => {
          throw new DOMException("blocked", "NotAllowedError");
        });
        const onChange = show();
        await openTab("Output");
        await browse();
        await waitFor(() =>
          expect(onChange).toHaveBeenCalledWith(outputWith("C:/Windows/Out")),
        );
        expect(confirm.mock.calls[0][0]).toContain("Can't access system folder");
      });

      it("stops when a blocked folder's prompt is declined", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(false);
        const prompt = vi.spyOn(window, "prompt");
        setPicker(async () => {
          throw new Error("It contains system files");
        });
        const onChange = show();
        await openTab("Output");
        await browse();
        expect(prompt).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
      });

      it("falls back to a manual path when the picker fails", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(window, "prompt").mockReturnValue("/srv/out");
        setPicker(async () => {
          throw new Error("SecurityError");
        });
        const onChange = show();
        await openTab("Output");
        await browse();
        await waitFor(() =>
          expect(onChange).toHaveBeenCalledWith(outputWith("/srv/out")),
        );
      });
    });
  });

  describe("Resources tab", () => {
    it("shows the server limits and default timeout", async () => {
      show();
      await openTab("Resources");
      const note = await screen.findByRole("note", { name: "Server limits" });
      expect(note.textContent).toContain(
        "This server allows up to 16 CPU cores and 64 GB of memory per run",
      );
      expect(screen.getByText(/0 uses\s+the server default \(60 minutes\)/)).toBeTruthy();
      expect(
        (screen.getByLabelText("Maximum CPU Cores") as HTMLInputElement).max,
      ).toBe("16");
    });

    it("says when the server has no timeout", async () => {
      serve({
        ...allAvailable,
        "/execute/limits": { ...(allAvailable["/execute/limits"] as object), defaultTimeoutMinutes: 0 },
      });
      show();
      await openTab("Resources");
      expect(await screen.findByText(/\(no limit\)/)).toBeTruthy();
    });

    it("works without server limits", async () => {
      serve({ ...allAvailable, "/execute/limits": new Error("404") });
      show(withSettings({ resources: { maxCpus: 48 } }));
      await openTab("Resources");
      expect(screen.queryByRole("note", { name: "Server limits" })).toBeNull();
      expect(
        screen.getByText(/24 hours unless NWAVE_EXECUTION_TIMEOUT says otherwise/),
      ).toBeTruthy();
      // The slider reaches the current value even above the usual 32.
      expect(
        (screen.getByLabelText("Maximum CPU Cores") as HTMLInputElement).max,
      ).toBe("48");
    });

    it("changes CPU, memory and timeout", async () => {
      const onChange = show(withSettings({ resources: { maxTime: "PT2H" } }));
      await openTab("Resources");
      const resources = { ...defaultExecutionSettings.resources, maxTime: "PT2H" };

      expect(
        (screen.getByLabelText("Execution Timeout (minutes)") as HTMLInputElement)
          .value,
      ).toBe("120");

      fireEvent.change(screen.getByLabelText("Maximum CPU Cores"), {
        target: { value: "8" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        resources: { ...resources, maxCpus: 8 },
      });

      fireEvent.change(screen.getByLabelText("Maximum Memory"), {
        target: { value: "12" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        resources: { ...resources, maxMemory: "12.GB" },
      });

      fireEvent.change(screen.getByLabelText("Execution Timeout (minutes)"), {
        target: { value: "90" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        resources: { ...resources, maxTime: "PT1H30M" },
      });

      fireEvent.change(screen.getByLabelText("Execution Timeout (minutes)"), {
        target: { value: "" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        resources: { ...resources, maxTime: "" },
      });
    });
  });

  describe("Advanced tab", () => {
    it("changes version, error strategy and cleanup", async () => {
      const onChange = show();
      await openTab("Advanced");
      const user = userEvent.setup();

      await user.selectOptions(screen.getByLabelText("Nextflow Version"), "24.04.4");
      expect(onChange).toHaveBeenLastCalledWith({
        nextflow: { ...defaultExecutionSettings.nextflow, version: "24.04.4" },
      });

      await user.selectOptions(
        screen.getByLabelText("Error Handling Strategy"),
        "retry",
      );
      expect(onChange).toHaveBeenLastCalledWith({
        errorHandling: {
          ...defaultExecutionSettings.errorHandling,
          strategy: "retry",
        },
      });

      await user.click(screen.getByLabelText("Cleanup on Failure"));
      expect(onChange).toHaveBeenLastCalledWith({
        cleanup: { ...defaultExecutionSettings.cleanup, onFailure: true },
      });
    });

    it("shows no warnings when everything is available", async () => {
      show();
      await screen.findByText("✅ Optimal Setup");
      await openTab("Advanced");
      expect(screen.queryByText("System Issues Detected:")).toBeNull();
      expect(
        screen.queryByText(/Docker execution is enabled but Docker is not/),
      ).toBeNull();
    });
  });
});

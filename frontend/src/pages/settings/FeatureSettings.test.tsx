import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Features } from "../../api/settings";

const get = vi.fn();
const put = vi.fn();
vi.mock("../../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
  },
  isDemoMode: false,
}));

const { default: FeatureSettings, FEATURE_SWITCHES } = await import("./FeatureSettings");
const { resetFeatures, currentFeatures } = await import("../../settings/useFeatures");
const { DEFAULT_FEATURES } = await import("../../api/settings");

const serve = (features: Partial<Features>, lockedFeatures: string[] = []) =>
  get.mockResolvedValue({ data: { runDefaults: {}, features: { ...DEFAULT_FEATURES, ...features }, lockedFeatures } });

describe("FeatureSettings", () => {
  beforeEach(() => {
    resetFeatures();
    get.mockReset();
    put.mockReset();
    put.mockImplementation(async (_url: string, body: { features: Features }) => ({
      data: { features: body.features, lockedFeatures: [] },
    }));
  });

  it("shows a switch per feature with what turning it off changes, as saved", async () => {
    serve({ resume: false, workflowCheck: "warn" });
    render(<FeatureSettings />);
    const resume = screen.getByRole("checkbox", { name: /^Resume/ }) as HTMLInputElement;
    await waitFor(() => expect(resume.checked).toBe(false));
    expect((screen.getByRole("radio", { name: /Only warn/ }) as HTMLInputElement).checked).toBe(true);
    const list = screen.getByRole("list", { name: "Feature switches" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(FEATURE_SWITCHES.length);
    expect(resume.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/Every run starts from scratch/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("saves each change right away, for everyone using this N-WAVE", async () => {
    serve({});
    const user = userEvent.setup();
    render(<FeatureSettings />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/settings"));

    await user.click(screen.getByRole("checkbox", { name: /^Connection hints/ }));
    expect(put).toHaveBeenLastCalledWith("/settings/features", {
      features: { ...DEFAULT_FEATURES, connectionHints: false },
    });
    await waitFor(() => expect(currentFeatures().connectionHints).toBe(false));

    await user.click(screen.getByRole("radio", { name: /^Off/ }));
    expect(put).toHaveBeenLastCalledWith("/settings/features", {
      features: { ...DEFAULT_FEATURES, connectionHints: false, workflowCheck: "off" },
    });
    await waitFor(() => expect(currentFeatures().workflowCheck).toBe("off"));
  });

  it("can't change switches the installation fixes", async () => {
    serve({ glossary: false, workflowCheck: "warn" }, ["glossary", "workflowCheck"]);
    render(<FeatureSettings />);
    const glossary = screen.getByRole("checkbox", { name: /^Glossary and Help/ }) as HTMLInputElement;
    await waitFor(() => expect(glossary.disabled).toBe(true));
    expect(glossary.checked).toBe(false);
    expect(screen.getByRole("group", { name: /Workflow check before running/ })).toHaveProperty("disabled", true);
    expect(screen.getAllByText("Fixed by this installation")).toHaveLength(2);
    expect(screen.getByRole("note").textContent).toContain("NWAVE_FEATURES");
    expect((screen.getByRole("checkbox", { name: /^Resume/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it("says why a change wasn't saved and keeps the switch as it was", async () => {
    serve({});
    put.mockRejectedValue({ response: { status: 409, data: { error: "This installation fixes resume." } } });
    const user = userEvent.setup();
    render(<FeatureSettings />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    const resume = screen.getByRole("checkbox", { name: /^Resume/ }) as HTMLInputElement;
    await user.click(resume);
    expect((await screen.findByRole("alert")).textContent).toContain("This installation fixes resume.");
    expect(resume.checked).toBe(true);
    expect(currentFeatures().resume).toBe(true);
  });

  it("says when the switches can't be read, and keeps everything on", async () => {
    get.mockRejectedValue(new Error("Network Error"));
    render(<FeatureSettings />);
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(currentFeatures()).toEqual(DEFAULT_FEATURES);
  });
});

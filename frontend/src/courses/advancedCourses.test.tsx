import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import CoursesPage from "../pages/CoursesPage";
import { type CourseRun, NO_RUN } from "./courseStage";
import { COURSE_STEPS } from "./courseSteps";
import type { CourseContext } from "./courses";
import { useStartCourse } from "./useStartCourse";

const post = vi.fn();
const getDefaults = vi.fn();
vi.mock("../api", () => ({ default: { post: (...args: unknown[]) => post(...args) }, isDemoMode: false }));
vi.mock("../api/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/settings")>()),
  getRunDefaults: () => getDefaults(),
}));

const context = (patch: Partial<CourseContext> = {}): CourseContext => ({
  nodes: [],
  edges: [],
  openPanels: [],
  clicked: new Set(),
  path: "/workflow/w1",
  run: NO_RUN,
  analysis: null,
  view: "editor",
  nested: null,
  runProfile: null,
  ...patch,
});
const run = (patch: Partial<CourseRun>): CourseRun => ({ ...NO_RUN, ...patch });
const clicks = (...names: string[]) => context({ clicked: new Set(names) });

describe("the run course's tasks", () => {
  const [, start, , log, wait, minimize, expand, results, output, history, cancel, home] = COURSE_STEPS.run;

  it("follow the run from its start to its end, and the run panel", () => {
    expect(start.done?.(context())).toBe(false);
    expect(start.done?.(context({ run: run({ running: true }) }))).toBe(true);
    expect(log.done?.(clicks("Log"))).toBe(true);
    expect(wait.done?.(context({ run: run({ running: true, runId: "r1" }) }))).toBe(false);
    expect(wait.done?.(context({ run: run({ runId: "r1" }) }))).toBe(true);
    expect(minimize.done?.(context({ run: run({ runId: "r1", panelOpen: true }) }))).toBe(false);
    expect(minimize.done?.(context({ run: run({ runId: "r1", panelOpen: false }) }))).toBe(true);
    expect(expand.done?.(context({ run: run({ panelOpen: true }) }))).toBe(true);
    expect(results.done?.(clicks("Results"))).toBe(true);
    expect(output.done?.(context({ openPanels: ["demo-output"] }))).toBe(true);
    expect(history.done?.(clicks("History"))).toBe(true);
    expect(cancel.done?.(context({ clicked: new Set(["Cancel run"]), run: run({ running: true }) }))).toBe(false);
    expect(cancel.done?.(context({ clicked: new Set(["Cancel run"]), run: run({ runId: "r2" }) }))).toBe(true);
    expect(home.done?.(context({ path: "/" }))).toBe(true);
  });
});

describe("the failures course's tasks", () => {
  const [, , failed, evidence, , fix, resumed, full, cache] = COURSE_STEPS.failures;
  const shout = (source: string) =>
    [{ id: "n-shout", data: { customNodeDefinition: { source } } as NodeData }] as Node<NodeData>[];

  it("follow the failure, the fixed typo, the resumed run and a full run", () => {
    expect(failed.done?.(context({ run: run({ runId: "r1", steps: { "n-say_hello": "succeeded" } }) }))).toBe(false);
    expect(failed.done?.(context({ run: run({ runId: "r1", steps: { "n-shout": "failed" } }) }))).toBe(true);
    expect(failed.done?.(context({ run: run({ runId: "r1", explained: true }) }))).toBe(true);
    expect(evidence.done?.(clicks("Show line 12 in the log"))).toBe(true);
    expect(fix.target).toBe("[data-edit-custom-node]");
    expect(fix.done?.(context({ nodes: shout("trr a-z A-Z < ${greeting} > shout.txt") }))).toBe(false);
    expect(fix.done?.(context({ nodes: shout("tr a-z A-Z < ${greeting} > shout.txt") }))).toBe(true);
    // Resumed: the first step from the cache.
    const cached = run({ runId: "r2", steps: { "n-say_hello": "cached", "n-shout": "succeeded" } });
    expect(resumed.done?.(context({ run: run({ runId: "r2", steps: { "n-say_hello": "succeeded" } }) }))).toBe(false);
    expect(resumed.done?.(context({ run: cached }))).toBe(true);
    // Resume off: every step ran (the resumed run, and the failed one, don't count).
    expect(full.done?.(context({ run: cached }))).toBe(false);
    expect(
      full.done?.(context({ run: run({ runId: "r1", steps: { "n-say_hello": "succeeded", "n-shout": "failed" } }) })),
    ).toBe(false);
    expect(
      full.done?.(
        context({ run: run({ runId: "r3", steps: { "n-say_hello": "succeeded", "n-shout": "succeeded" } }) }),
      ),
    ).toBe(true);
    // The cache: explained, not a task (clearing isn't needed for a full run).
    expect(cache.done).toBeUndefined();
  });
});

describe("the pipeline course's tasks", () => {
  const [, open, , start, wait, results, inside] = COURSE_STEPS.pipeline;

  it("follow the Pipeline node from its form to its steps", () => {
    expect(open.done?.(context({ openPanels: ["rnaseq-pipeline"] }))).toBe(true);
    expect(start.done?.(context({ run: run({ running: true }) }))).toBe(true);
    expect(wait.done?.(context({ run: run({ runId: "r1" }) }))).toBe(true);
    expect(results.done?.(clicks("Results"))).toBe(true);
    expect(inside.done?.(context({ nested: "rnaseq-pipeline" }))).toBe(true);
  });
});

describe("the clusters course's tasks", () => {
  beforeEach(() => getDefaults.mockReset());

  it("follow the limits, the profile saved in Global Settings, and the export", async () => {
    const [, resources, limits, add, save, choose, exported] = COURSE_STEPS.clusters;
    expect(resources.done?.(clicks("Resources"))).toBe(true);
    expect(limits.page).toBe("settings");
    expect(add.done?.(clicks("SLURM profile"))).toBe(true);
    expect(save.done?.(context())).toBe(false);
    // Saved: the run defaults read again have the profile.
    const { useRunDefaults, resetRunDefaults } = await import("../settings/useRunDefaults");
    resetRunDefaults();
    getDefaults.mockResolvedValue({
      maxCpus: 4,
      maxMemory: "4.GB",
      maxTime: 0,
      resume: "after-failure",
      runProfiles: [{ name: "cluster", executor: "slurm", queue: "short" }],
    });
    renderHook(() => useRunDefaults());
    await waitFor(() => expect(save.done?.(context())).toBe(true));
    expect(choose.done?.(context({ runProfile: "cluster" }))).toBe(true);
    expect(exported.done?.(clicks("Download project"))).toBe(true);
  });
});

describe("the structure course's tasks", () => {
  const [, analyse, error, fixed, specification, dependencies, editor, aligner, group] = COURSE_STEPS.structure;
  const parameters = (value: string) =>
    [
      {
        id: "n-params",
        type: "parameters",
        data: { label: "Parameters", parameters: [{ name: "aligner", type: "text", value }] } as NodeData,
      },
    ] as Node<NodeData>[];

  it("follow the analysis, the views, the condition and a group", () => {
    expect(analyse.done?.(context())).toBe(false);
    expect(analyse.done?.(context({ analysis: { problems: 0 } }))).toBe(true);
    expect(error.done?.(context({ analysis: { problems: 0 } }))).toBe(false);
    expect(error.done?.(context({ analysis: { problems: 1 } }))).toBe(true);
    expect(fixed.done?.(context({ analysis: { problems: 0 } }))).toBe(true);
    expect(specification.done?.(context({ view: "specification" }))).toBe(true);
    expect(dependencies.done?.(context({ view: "dependencies" }))).toBe(true);
    expect(editor.done?.(context({ view: "editor" }))).toBe(true);
    expect(aligner.done?.(context({ nodes: parameters("star") }))).toBe(false);
    expect(aligner.done?.(context({ nodes: parameters("hisat2") }))).toBe(true);
    expect(
      group.done?.(context({ nodes: [{ id: "n-qc", data: { group: "QC" } as NodeData }] as Node<NodeData>[] })),
    ).toBe(true);
  });
});

describe("starting an advanced course", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    post.mockReset();
    post.mockResolvedValue({ data: { _id: "w9" } });
  });
  afterEach(() => vi.clearAllMocks());

  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/courses"]}>
      <Routes>
        <Route path="/courses" element={children} />
        <Route path="/workflow/:id" element={<p>workflow</p>} />
      </Routes>
    </MemoryRouter>
  );

  it("copies Demo 1 for running, and Demo 2 for the pipeline", async () => {
    const { result } = renderHook(() => useStartCourse(), { wrapper });
    await result.current.start("run");
    expect(post).toHaveBeenLastCalledWith("/workflows/builtin:demo-basic/duplicate");
    await result.current.start("pipeline");
    expect(post).toHaveBeenLastCalledWith("/workflows/builtin:rnaseq-pipeline/duplicate");
    await result.current.start("clusters");
    expect(post).toHaveBeenLastCalledWith("/workflows/builtin:demo-basic/duplicate");
    expect(JSON.parse(sessionStorage.getItem("nwave.course.active") ?? "null")).toEqual({
      course: "clusters",
      part: "canvas",
      step: 0,
    });
  });

  it("imports the failing workflow, with the step the course fixes", async () => {
    const { result } = renderHook(() => useStartCourse(), { wrapper });
    await result.current.start("failures");
    const [url, draft] = post.mock.lastCall as [string, { name: string; nodes: Node<NodeData>[]; edges: unknown[] }];
    expect(url).toBe("/workflows");
    expect(draft.name).toBe("A run that fails");
    expect(draft.nodes.map((entry) => entry.id).sort()).toEqual(["n-say_hello", "n-shout"]);
    expect(draft.edges).toHaveLength(1);
    const shout = draft.nodes.find((entry) => entry.id === "n-shout");
    expect((shout?.data.customNodeDefinition as { source?: string } | undefined)?.source).toContain("trr a-z A-Z");
  });

  it("imports the workflow with two aligners, its parameter and the nodes the course names", async () => {
    const { result } = renderHook(() => useStartCourse(), { wrapper });
    await result.current.start("structure");
    const [, draft] = post.mock.lastCall as [string, { nodes: Node<NodeData>[] }];
    const ids = draft.nodes.map((entry) => entry.id);
    for (const id of ["n-params", "n-trim", "n-qc", "n-align_star", "n-align_hisat", "n-report"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("the advanced courses on the Courses page", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("can be started on an installation, and show when they are done", () => {
    localStorage.setItem("nwave.courses.completed", JSON.stringify(["run"]));
    render(
      <MemoryRouter>
        <CoursesPage />
      </MemoryRouter>,
    );
    const advanced = screen.getByRole("region", { name: "Advanced" });
    expect(within(advanced).queryByText("Coming soon")).toBeNull();
    const first = within(advanced).getByRole("listitem", { name: "Run a workflow" });
    expect(first.textContent).toContain("Done");
    expect(within(first).getByRole("button", { name: "Take it again" })).toBeTruthy();
    for (const title of [
      "When a run fails",
      "Run an nf-core pipeline",
      "Run limits and clusters",
      "Read a workflow's structure",
    ]) {
      const card = within(advanced).getByRole("listitem", { name: title });
      expect(within(card).getByRole("button", { name: "Start" })).toBeTruthy();
    }
    post.mockResolvedValue({ data: { _id: "w9" } });
    fireEvent.click(within(first).getByRole("button", { name: "Take it again" }));
    expect(post).toHaveBeenCalledWith("/workflows/builtin:demo-basic/duplicate");
  });
});

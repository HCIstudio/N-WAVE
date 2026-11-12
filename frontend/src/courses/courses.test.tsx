import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { demoWorkflowSeed } from "../demo/demoWorkflow";
import CoursesPage from "../pages/CoursesPage";
import CourseCard from "./CourseCard";
import { COURSE_STEPS } from "./courseSteps";
import type { CourseContext } from "./courses";
import { completedCourses, setActiveCourse } from "./courseState";
import { DONE_PAUSE_MS, useCourse } from "./useCourse";

const demo = demoWorkflowSeed as unknown as { nodes: Node<NodeData>[]; edges: Edge[] };

const Harness = ({ nodes, edges, openPanels }: { nodes: Node<NodeData>[]; edges: Edge[]; openPanels: string[] }) => {
  const course = useCourse({ nodes, edges, openPanels });
  return (
    <MemoryRouter>
      {/* A control a task asks for (the + menu's button). */}
      <button type="button" aria-label="Add node" />
      {course && <CourseCard course={course} />}
    </MemoryRouter>
  );
};

const startAt = (course: string, step: number) =>
  sessionStorage.setItem("nwave.course.active", JSON.stringify({ course, part: "canvas", step }));
const card = () => screen.getByRole("region", { name: "Course" });

describe("a course on the canvas", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("waits for the user to do a task, ticks it, and goes on by itself", () => {
    startAt("canvas", 1);
    const { rerender } = render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    expect(card().textContent).toContain("Double-click the Map node");
    expect(card().textContent).toContain("Your turn");
    expect(within(card()).queryByRole("button", { name: "Next" })).toBeNull();

    rerender(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={["demo-map-uppercase"]} />);
    expect(card().textContent).toContain("Done");
    act(() => {
      vi.advanceTimersByTime(DONE_PAUSE_MS);
    });
    expect(card().textContent).toContain("Case to Lowercase");
    expect(card().textContent).toContain("3 of 11");
    expect(JSON.parse(sessionStorage.getItem("nwave.course.active") ?? "null")).toMatchObject({ step: 2 });
  });

  it("goes on when the control a step asks for is clicked", () => {
    startAt("canvas", 4);
    render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    expect(card().textContent).toContain("Open the + menu");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    act(() => {
      vi.advanceTimersByTime(DONE_PAUSE_MS);
    });
    expect(card().textContent).toContain("Pick Filter");
  });

  it("lets a task be skipped, and an explanation go on with Next", () => {
    startAt("canvas", 0);
    render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    fireEvent.click(within(card()).getByRole("button", { name: "Next" }));
    fireEvent.click(within(card()).getByRole("button", { name: "Skip this step" }));
    expect(card().textContent).toContain("Case to Lowercase");
  });

  it("is marked done at its end, and offers the next course", () => {
    startAt("canvas", COURSE_STEPS.canvas.length - 1);
    render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    expect(within(card()).getByRole("button", { name: "Next course: Build with nf-core modules" })).toBeTruthy();
    fireEvent.click(within(card()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Course" })).toBeNull();
    expect(completedCourses().has("canvas")).toBe(true);
    expect(sessionStorage.getItem("nwave.course.active")).toBeNull();
  });

  it("is left without being marked done", () => {
    startAt("canvas", 0);
    render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    fireEvent.click(within(card()).getByRole("button", { name: "Leave course" }));
    expect(screen.queryByRole("region", { name: "Course" })).toBeNull();
    expect(completedCourses().size).toBe(0);
  });
});

const ctx = (nodes: Array<Partial<Node<NodeData>>>, edges: Array<[string, string]> = []): CourseContext => ({
  nodes: nodes as Node<NodeData>[],
  edges: edges.map(([source, target], index) => ({ id: `e${index}`, source, target })),
  openPanels: [],
  clicked: new Set(),
});

describe("the canvas course's tasks", () => {
  const [, , lowercase, remove, , pick, connectIn, connectOut] = COURSE_STEPS.canvas;

  it("follow the user's copy of Demo 1", () => {
    const map = (data: Record<string, unknown>) => ({ id: "demo-map-uppercase", data: data as NodeData });
    expect(lowercase.done?.(ctx([map({ mapTransformation: "uppercase" })]))).toBe(false);
    expect(lowercase.done?.(ctx([map({ mapChangeCase: "toUpperCase" })]))).toBe(false);
    expect(lowercase.done?.(ctx([map({ mapChangeCase: "toLowerCase" })]))).toBe(true);
    expect(remove.done?.(ctx([{ id: "demo-filter-bee" }]))).toBe(false);
    expect(remove.done?.(ctx([{ id: "demo-file-input" }]))).toBe(true);
    const added = { id: "node-1", data: { label: "Filter" } as NodeData };
    expect(pick.done?.(ctx([{ id: "demo-filter-barry", data: { label: "Filter" } as NodeData }]))).toBe(false);
    expect(pick.done?.(ctx([added]))).toBe(true);
    expect(connectIn.done?.(ctx([added], [["demo-file-input", "demo-filter-barry"]]))).toBe(false);
    expect(connectIn.done?.(ctx([added], [["demo-file-input", "node-1"]]))).toBe(true);
    expect(connectOut.done?.(ctx([added], [["node-1", "demo-merge"]]))).toBe(true);
  });
});

describe("the nf-core course's tasks", () => {
  const [, sheet, fastqc, toFastqc, multiqc, toMultiqc] = COURSE_STEPS["nfcore-modules"];
  const nodes = [
    { id: "s", type: "samplesheet", data: {} as NodeData },
    { id: "f", type: "process", data: { nwaveNfCoreModuleId: "nf-core/fastqc" } as NodeData },
    { id: "m", type: "process", data: { processType: "nfcore_multiqc" } as NodeData },
  ];

  it("follow the workflow being built", () => {
    expect(sheet.done?.(ctx([]))).toBe(false);
    expect(sheet.done?.(ctx(nodes.slice(0, 1)))).toBe(true);
    expect(fastqc.done?.(ctx(nodes.slice(0, 1)))).toBe(false);
    expect(fastqc.done?.(ctx(nodes.slice(0, 2)))).toBe(true);
    expect(toFastqc.done?.(ctx(nodes, [["f", "s"]]))).toBe(false);
    expect(toFastqc.done?.(ctx(nodes, [["s", "f"]]))).toBe(true);
    expect(multiqc.done?.(ctx(nodes))).toBe(true);
    expect(toMultiqc.done?.(ctx(nodes, [["f", "m"]]))).toBe(true);
  });
});

describe("CoursesPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lists the basics, then the advanced courses to come, and starts the first on the home page", () => {
    localStorage.setItem("nwave.courses.completed", JSON.stringify(["home"]));
    render(
      <MemoryRouter>
        <CoursesPage />
      </MemoryRouter>,
    );
    const basics = screen.getByRole("region", { name: "Basics" });
    const first = within(basics).getByRole("listitem", { name: "The home page" });
    expect(within(basics).getByRole("listitem", { name: "The canvas" })).toBeTruthy();
    expect(first.textContent).toContain("Done");
    expect(within(basics).getByRole("listitem", { name: "Build with nf-core modules" })).toBeTruthy();
    const advanced = screen.getByRole("region", { name: "Advanced" });
    expect(within(advanced).getAllByText("Coming soon").length).toBeGreaterThan(0);
    expect(within(advanced).queryByRole("button", { name: "Start" })).toBeNull();

    fireEvent.click(within(first).getByRole("button", { name: "Take it again" }));
    expect(JSON.parse(sessionStorage.getItem("nwave.course.active") ?? "null")).toEqual({
      course: "home",
      part: "home",
      step: 1,
    });
  });
});

describe("a course started while its page is open", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("shows on the canvas at once (the next course opens another workflow on the same page)", () => {
    render(<Harness nodes={demo.nodes} edges={demo.edges} openPanels={[]} />);
    expect(screen.queryByRole("region", { name: "Course" })).toBeNull();
    act(() => setActiveCourse({ course: "nfcore-modules", part: "canvas", step: 0 }));
    expect(card().textContent).toContain("Build with nf-core modules");
  });
});

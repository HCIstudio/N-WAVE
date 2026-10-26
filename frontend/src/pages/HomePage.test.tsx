import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDescriptor } from "../types/backend";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const apiDelete = vi.fn();
vi.mock("../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
  },
  isDemoMode: false,
}));
// Every workflow's runs (the run list and the cards' last run).
const listRuns = vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []);
const cancelRun = vi.fn(async (_id: string) => {});
vi.mock("../api/runs", () => ({
  listRuns: (...args: unknown[]) => listRuns(...args),
  cancelRun: (id: string) => cancelRun(id),
  getRunLog: async () => "",
}));
// The build constants come from vite's `define`, which vitest doesn't load.
vi.mock("../utils/buildInfo", () => ({
  buildInfo: {
    version: "1.2.3",
    sha: "abc123",
    buildDate: "2026-10-01T00:00:00Z",
    displayBuildDate: "2026-10-01",
  },
}));

const { default: HomePage } = await import("./HomePage");

const TUTORIAL_DONE = ["nwave.demoTutorial.completed", "custom-nodes-v3"] as const;

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const workflow = (
  id: string,
  name: string,
  extra: Partial<WorkflowDescriptor> = {},
): WorkflowDescriptor => ({
  _id: id,
  name,
  description: `${name} description`,
  nodes: [],
  edges: [],
  ...extra,
});

const rnaseq = workflow("wf-1", "RNA-seq", {
  updatedAt: daysAgo(3),
  nodes: [
    { id: "a", type: "process", position: { x: 0, y: 0 }, data: {} },
    { id: "n", type: "note", position: { x: 0, y: 0 }, data: {} },
  ] as WorkflowDescriptor["nodes"],
});
const scratch = workflow("wf-2", "Scratch", { description: "" });
const demo = workflow("builtin:demo-basic", "Basic demo", {
  isBuiltin: true,
  isReadOnly: true,
  origin: {
    type: "builtin",
    sourceFormat: "visual",
    readOnly: true,
    canDuplicate: true,
  },
});

const OpenedWorkflow = () => <p>Opened {useParams().id}</p>;

const setup = async (workflows: WorkflowDescriptor[]) => {
  get.mockResolvedValue({ data: workflows });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workflow/:id" element={<OpenedWorkflow />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Workflows" });
  return { user };
};

const card = (name: string) =>
  screen.getByRole("heading", { name }).closest("a, div.group") as HTMLElement;

const button = (name: string | RegExp) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

const toast = () => screen.findByText(/^Failed to/);

describe("HomePage", () => {
  beforeEach(() => {
    localStorage.setItem(...TUTORIAL_DONE);
    sessionStorage.clear();
    get.mockReset();
    listRuns.mockResolvedValue([]);
    cancelRun.mockClear();
    post.mockReset();
    put.mockReset();
    apiDelete.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a loading state, then the workflows", async () => {
    let resolve: (value: { data: WorkflowDescriptor[] }) => void = () => {};
    get.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading workflows...")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/workflows");
    resolve({ data: [rnaseq] });
    expect(await screen.findByRole("heading", { name: "RNA-seq" })).toBeTruthy();
    expect(screen.queryByText("Loading workflows...")).toBeNull();
  });

  it("offers a retry when the workflows can't be loaded", async () => {
    get.mockRejectedValueOnce({ response: { data: { message: "ECONNREFUSED" } } });
    get.mockResolvedValueOnce({ data: [rnaseq] });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn't load your workflows")).toBeTruthy();
    expect(within(alert).getByText("Details: ECONNREFUSED")).toBeTruthy();

    await user.click(button("Try again"));
    expect(await screen.findByRole("heading", { name: "RNA-seq" })).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("shows each workflow's last run, and every run with a way to stop the ones going on", async () => {
    listRuns.mockResolvedValue([
      { id: "r3", workflowId: "wf-2", workflowName: "Scratch", status: "running", startedAt: daysAgo(0) },
      { id: "r2", workflowId: "wf-1", workflowName: "RNA-seq", status: "failed", startedAt: daysAgo(2), finishedAt: daysAgo(2) },
      { id: "r1", workflowId: "wf-1", workflowName: "RNA-seq", status: "succeeded", startedAt: daysAgo(5), finishedAt: daysAgo(5) },
    ]);
    await setup([rnaseq, scratch]);
    const card = (name: string) =>
      screen.getByRole("heading", { name }).closest("a, article, div[class*='rounded']") as HTMLElement;
    expect(await within(card("RNA-seq")).findByText("Ran 2 days ago, failed")).toBeTruthy();
    expect(within(card("Scratch")).getByText("Running now")).toBeTruthy();

    const runs = screen.getByRole("region", { name: "Runs" });
    expect(within(runs).getByText(/1 going on now/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(runs).getByRole("button", { name: "Stop all running (1)" }));
    await user.click(screen.getByRole("button", { name: "Stop all" }));
    expect(cancelRun).toHaveBeenCalledWith("r3");
    expect(cancelRun).toHaveBeenCalledOnce();
  });

  it("separates the built-in demos from the user's workflows", async () => {
    await setup([rnaseq, demo, scratch]);
    const demos = screen.getByRole("region", { name: "Built-in demos" });
    const own = screen.getByRole("region", { name: "Your workflows" });
    expect(within(demos).getByRole("heading", { name: "Basic demo" })).toBeTruthy();
    expect(within(own).getByRole("heading", { name: "RNA-seq" })).toBeTruthy();
    expect(within(own).getByRole("heading", { name: "Scratch" })).toBeTruthy();
    expect(within(own).queryByText(/haven't created any workflows/)).toBeNull();

    const about = (name: string) =>
      within(card(name)).getByRole("list", { name: "About this workflow" })
        .textContent;
    // Notes don't count as nodes.
    expect(about("RNA-seq")).toBe("1 nodeChanged 3 days ago");
    expect(about("Scratch")).toBe("0 nodes");
    // Built-in demos show the build date, and say they're read-only.
    expect(about("Basic demo")).toMatch(/^0 nodesRead-onlyChanged /);
    expect(within(card("Scratch")).getByText("No description")).toBeTruthy();
    expect(screen.getByText("v1.2.3")).toBeTruthy();
  });

  it("says when the user has no workflows yet", async () => {
    await setup([demo]);
    expect(screen.getByText(/You haven't created any workflows yet/)).toBeTruthy();
  });

  it("opens a workflow from its card", async () => {
    const { user } = await setup([rnaseq]);
    await user.click(screen.getByRole("heading", { name: "RNA-seq" }));
    expect(await screen.findByText("Opened wf-1")).toBeTruthy();
  });

  it("creates an empty workflow and opens it", async () => {
    post.mockResolvedValue({ data: { _id: "new-1" } });
    const { user } = await setup([]);
    await user.click(button("New Workflow"));
    await user.click(button("Empty workflow"));

    expect(post).toHaveBeenCalledWith(
      "/workflows",
      expect.objectContaining({
        name: "Untitled Workflow",
        nodes: [],
        edges: [],
        description: "",
      }),
    );
    expect(await screen.findByText("Opened new-1")).toBeTruthy();
  });

  it("starts a workflow from a template", async () => {
    post.mockResolvedValue({ data: { _id: "new-2" } });
    const { user } = await setup([]);
    await user.click(button("New Workflow"));
    await user.click(button("QC of FASTQ files"));

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/workflows");
    expect(body.name).toBe("QC of FASTQ files");
    expect(body.nodes.map((node: { id: string }) => node.id)).toEqual(
      expect.arrayContaining(["samples", "fastqc", "multiqc"]),
    );
    expect(body.edges).toHaveLength(2);
    expect(await screen.findByText("Opened new-2")).toBeTruthy();
  });

  it("offers each built-in demo as an editable copy", async () => {
    post.mockResolvedValue({ data: { _id: "copy-1" } });
    const { user } = await setup([demo]);
    await user.click(button("New Workflow"));
    const dialog = screen.getByRole("dialog", { name: "Start a new workflow" });
    const copy = within(dialog).getByRole("button", { name: "Basic demo" });
    expect(copy.getAttribute("aria-describedby")).toBeTruthy();
    await user.click(copy);

    expect(post).toHaveBeenCalledWith("/workflows/builtin:demo-basic/duplicate");
    expect(await screen.findByText("Opened copy-1")).toBeTruthy();
  });

  it("shows creating while it waits and reports a failure", async () => {
    let reject: (error: unknown) => void = () => {};
    post.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const { user } = await setup([]);
    await user.click(button("New Workflow"));
    await user.click(button("Empty workflow"));
    expect(button("Empty workflow").disabled).toBe(true);

    reject({ response: { data: { error: "Database is read-only" } } });
    expect((await toast()).textContent).toBe(
      "Failed to create new workflow. Database is read-only",
    );
    expect(button("Empty workflow").disabled).toBe(false);
  });

  describe("renaming", () => {
    const startEditing = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(card("RNA-seq")).getByRole("button", { name: "Edit" }));
      const [name, description] = screen.getAllByRole("textbox");
      return { name, description };
    };

    it("saves a new name and description with Enter", async () => {
      put.mockResolvedValue({ data: {} });
      const { user } = await setup([rnaseq]);
      const { name, description } = await startEditing(user);
      expect(document.activeElement).toBe(name);
      expect((name as HTMLTextAreaElement).value).toBe("RNA-seq");

      await user.clear(name);
      await user.type(name, "Bulk RNA-seq");
      await user.clear(description);
      await user.type(description, "Salmon based{Enter}");

      expect(put).toHaveBeenCalledWith("/workflows/wf-1", {
        name: "Bulk RNA-seq",
        description: "Salmon based",
      });
      expect(await screen.findByRole("heading", { name: "Bulk RNA-seq" })).toBeTruthy();
      expect(screen.getByText("Salmon based")).toBeTruthy();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("saves with the save button", async () => {
      put.mockResolvedValue({ data: {} });
      const { user } = await setup([rnaseq]);
      const { name } = await startEditing(user);
      await user.type(name, "!");
      await user.click(button("Save"));
      expect(put).toHaveBeenCalledWith("/workflows/wf-1", {
        name: "RNA-seq!",
        description: "RNA-seq description",
      });
      expect(await screen.findByRole("heading", { name: "RNA-seq!" })).toBeTruthy();
    });

    it("keeps editing when saving fails", async () => {
      put.mockRejectedValue(new Error("Conflict"));
      const { user } = await setup([rnaseq]);
      const { name } = await startEditing(user);
      await user.type(name, "x{Enter}");
      expect((await toast()).textContent).toBe("Failed to update workflow. Conflict");
      expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toBe(
        "RNA-seqx",
      );
    });

    it("closes without asking when nothing changed", async () => {
      const { user } = await setup([rnaseq]);
      await startEditing(user);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
    });

    it("asks before discarding changes", async () => {
      const { user } = await setup([rnaseq]);
      const { name } = await startEditing(user);
      await user.type(name, " v2");
      await user.keyboard("{Escape}");

      expect(screen.getByText("Unsaved Changes")).toBeTruthy();
      await user.click(button("Discard"));
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByRole("heading", { name: "RNA-seq" })).toBeTruthy();
      expect(put).not.toHaveBeenCalled();
    });

    it("can save the changes from the prompt after clicking outside", async () => {
      put.mockResolvedValue({ data: {} });
      const { user } = await setup([rnaseq]);
      const { name } = await startEditing(user);
      await user.type(name, " v2");
      await user.click(screen.getByRole("heading", { name: "Workflows" }));

      expect(screen.getByText("Unsaved Changes")).toBeTruthy();
      await user.click(button("Save Changes"));
      expect(put).toHaveBeenCalledWith("/workflows/wf-1", {
        name: "RNA-seq v2",
        description: "RNA-seq description",
      });
      expect(await screen.findByRole("heading", { name: "RNA-seq v2" })).toBeTruthy();
    });

    it("keeps editing when the prompt is cancelled", async () => {
      const { user } = await setup([rnaseq]);
      const { name } = await startEditing(user);
      await user.type(name, " v2");
      await user.keyboard("{Escape}");
      await user.click(button("Cancel"));
      expect(screen.queryByText("Unsaved Changes")).toBeNull();
      expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toBe(
        "RNA-seq v2",
      );
    });
  });

  describe("deleting", () => {
    it("deletes a workflow after confirming", async () => {
      apiDelete.mockResolvedValue({});
      const { user } = await setup([rnaseq, scratch]);
      await user.click(within(card("Scratch")).getByRole("button", { name: "Delete" }));
      expect(
        screen.getByText(
          "Are you sure you want to delete this workflow? This action cannot be undone.",
        ),
      ).toBeTruthy();
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
      );

      expect(apiDelete).toHaveBeenCalledWith("/workflows/wf-2");
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Scratch" })).toBeNull(),
      );
      expect(screen.getByRole("heading", { name: "RNA-seq" })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("deletes from the edit mode too", async () => {
      apiDelete.mockResolvedValue({});
      const { user } = await setup([rnaseq]);
      await user.click(within(card("RNA-seq")).getByRole("button", { name: "Edit" }));
      await user.click(button("Delete"));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
      );
      expect(apiDelete).toHaveBeenCalledWith("/workflows/wf-1");
    });

    it("keeps the workflow when cancelled", async () => {
      const { user } = await setup([scratch]);
      await user.click(within(card("Scratch")).getByRole("button", { name: "Delete" }));
      await user.click(button("Cancel"));
      expect(apiDelete).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Scratch" })).toBeTruthy();
    });

    it("keeps the workflow when deleting fails", async () => {
      apiDelete.mockRejectedValue(new Error("Forbidden"));
      const { user } = await setup([scratch]);
      await user.click(within(card("Scratch")).getByRole("button", { name: "Delete" }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
      );
      expect((await toast()).textContent).toBe("Failed to delete workflow. Forbidden");
      expect(screen.getByRole("heading", { name: "Scratch" })).toBeTruthy();
    });

    it("can't delete or edit read-only demos", async () => {
      await setup([demo]);
      const demoCard = card("Basic demo");
      expect(within(demoCard).queryByRole("button", { name: "Delete" })).toBeNull();
      expect(within(demoCard).queryByRole("button", { name: "Edit" })).toBeNull();
    });
  });

  describe("duplicating", () => {
    it("duplicates a demo and opens the copy", async () => {
      post.mockResolvedValue({ data: { _id: "copy-1" } });
      const { user } = await setup([demo]);
      await user.click(within(card("Basic demo")).getByRole("button", { name: "Duplicate" }));
      expect(post).toHaveBeenCalledWith("/workflows/builtin:demo-basic/duplicate");
      expect(await screen.findByText("Opened copy-1")).toBeTruthy();
    });

    it("reports a failed duplicate and stays on the list", async () => {
      post.mockRejectedValue(new Error("Quota"));
      const { user } = await setup([demo]);
      await user.click(button("Duplicate"));
      expect((await toast()).textContent).toBe("Failed to duplicate workflow. Quota");
      expect(button("Duplicate").disabled).toBe(false);
    });
  });

  describe("importing", () => {
    const helloSource = [
      "process HELLO {",
      "  output:",
      "  stdout",
      "  script:",
      '  "echo hi"',
      "}",
      "",
      "workflow {",
      "  HELLO()",
      "}",
    ].join("\n");

    const openImport = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(button("Import Workflow"));
      return within(screen.getByRole("dialog"));
    };

    it("imports pasted Nextflow source", async () => {
      post.mockResolvedValue({ data: { _id: "imported-1" } });
      const { user } = await setup([]);
      const dialog = await openImport(user);
      const importButton = dialog.getByRole("button", { name: "Import" }) as HTMLButtonElement;
      expect(importButton.disabled).toBe(true);

      await user.type(dialog.getByLabelText("Name"), "Hello world");
      await user.type(dialog.getByLabelText("Description"), "Says hi");
      await user.click(dialog.getByLabelText("Nextflow Source"));
      await user.paste(helloSource);
      await user.click(importButton);

      expect(post).toHaveBeenCalledWith(
        "/workflows",
        expect.objectContaining({
          name: "Hello world",
          description: "Says hi",
          rawSource: helloSource,
          sourceKey: null,
          originType: "imported",
        }),
      );
      expect(await screen.findByText("Opened imported-1")).toBeTruthy();
    });

    it("names the workflow after the chosen file", async () => {
      post.mockResolvedValue({ data: { _id: "imported-2" } });
      const { user } = await setup([]);
      const dialog = await openImport(user);
      await user.upload(
        dialog.getByLabelText("Nextflow File"),
        new File([helloSource], "hello.nf", { type: "text/plain" }),
      );

      expect(await dialog.findByText("hello.nf")).toBeTruthy();
      expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("hello");
      expect((dialog.getByLabelText("Nextflow Source") as HTMLTextAreaElement).value).toBe(
        helloSource,
      );
      await user.click(dialog.getByRole("button", { name: "Import" }));
      expect(post).toHaveBeenCalledWith(
        "/workflows",
        expect.objectContaining({ name: "hello", sourceKey: "hello.nf" }),
      );
    });

    it("keeps a name typed before choosing the file", async () => {
      const { user } = await setup([]);
      const dialog = await openImport(user);
      await user.type(dialog.getByLabelText("Name"), "Mine");
      await user.upload(
        dialog.getByLabelText("Nextflow File"),
        new File([helloSource], "hello.nf"),
      );
      expect(await dialog.findByText("hello.nf")).toBeTruthy();
      expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("Mine");
    });

    it("reports a failed import and keeps the form", async () => {
      post.mockRejectedValue(new Error("Too large"));
      const { user } = await setup([]);
      const dialog = await openImport(user);
      await user.click(dialog.getByLabelText("Nextflow Source"));
      await user.paste(helloSource);
      await user.click(dialog.getByRole("button", { name: "Import" }));

      expect((await toast()).textContent).toBe("Failed to import workflow. Too large");
      expect(
        (dialog.getByLabelText("Nextflow Source") as HTMLTextAreaElement).value,
      ).toBe(helloSource);
    });

    it("clears the form when cancelled", async () => {
      const { user } = await setup([]);
      let dialog = await openImport(user);
      await user.type(dialog.getByLabelText("Name"), "Draft");
      await user.click(dialog.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      dialog = await openImport(user);
      expect((dialog.getByLabelText("Name") as HTMLInputElement).value).toBe("");
      await user.click(dialog.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("tutorial", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("highlights the demo until the tutorial is skipped", async () => {
      const { user } = await setup([demo]);
      const tutorial = screen.getByRole("region", { name: "Tutorial" });
      expect(tutorial.textContent).toContain("Getting started");
      expect(within(card("Basic demo")).queryByRole("button")).toBeNull();
      expect(screen.queryByRole("button", { name: "Retake Tutorial" })).toBeNull();

      await user.click(within(tutorial).getByRole("button", { name: "skip the tutorial" }));
      expect(localStorage.getItem(TUTORIAL_DONE[0])).toBe(TUTORIAL_DONE[1]);
      expect(screen.queryByRole("region", { name: "Tutorial" })).toBeNull();
      expect(within(card("Basic demo")).getByRole("button", { name: "Duplicate" })).toBeTruthy();

      await user.click(button("Retake Tutorial"));
      expect(localStorage.getItem(TUTORIAL_DONE[0])).toBeNull();
      expect(screen.getByRole("region", { name: "Tutorial" })).toBeTruthy();
    });

    it("starts the tutorial when the demo is opened", async () => {
      const { user } = await setup([demo]);
      await user.click(screen.getByRole("heading", { name: "Basic demo" }));
      expect(sessionStorage.getItem("nwave.demoTutorial.active")).toBe("true");
      expect(sessionStorage.getItem("nwave.demoTutorial.step")).toBe("0");
      expect(await screen.findByText("Opened builtin:demo-basic")).toBeTruthy();
    });

    it("isn't shown without the demo workflow", async () => {
      await setup([rnaseq]);
      expect(screen.queryByRole("region", { name: "Tutorial" })).toBeNull();
    });
  });
});

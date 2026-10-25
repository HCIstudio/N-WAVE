import { act } from "react";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, renderHook } from "../../test/renderHook";
import { DEFAULT_EXECUTION_SETTINGS } from "./executionSettings";

const get = vi.fn();
const put = vi.fn(async () => ({ data: {} }));
const post = vi.fn();
vi.mock("../../api", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...(args as [])),
    post: (...args: unknown[]) => post(...args),
  },
  isDemoMode: false,
}));
const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

const { useWorkflowDocument } = await import("./useWorkflowDocument");
const { announceWorkflowRevisions } = await import("../../api/workflowRevisions");

const storedNode = {
  id: "in",
  type: "fileInput",
  position: { x: 0, y: 0 },
  data: { label: "Reads", files: [{ name: "a.txt", size: 1, content: "abc" }] },
};

describe("useWorkflowDocument", () => {
  const options = () => ({
    workflowId: "wf1" as string | undefined,
    nodes: [] as Node[],
    edges: [],
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    isDirty: false,
    setIsDirty: vi.fn(),
    showError: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("loads the workflow, its read-only flag and its settings", async () => {
    get.mockResolvedValueOnce({
      data: {
        name: " ",
        nodes: [storedNode],
        edges: [],
        isReadOnly: true,
        importWarnings: ["Ignored a channel"],
        executionSettings: DEFAULT_EXECUTION_SETTINGS,
      },
    });
    const props = options();
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: props,
    });
    await flush();
    expect(get).toHaveBeenCalledWith("/workflows/wf1");
    expect(result.current).toMatchObject({
      workflowName: "Untitled Workflow",
      readOnly: true,
      importWarnings: ["Ignored a channel"],
      isLoading: false,
      loadError: null,
    });
    expect(props.setNodes).toHaveBeenCalledWith([storedNode]);
    expect(props.setIsDirty).toHaveBeenCalledWith(false);
    expect(JSON.parse(localStorage.getItem("executionSettings") ?? "{}")).toEqual(
      DEFAULT_EXECUTION_SETTINGS,
    );
    unmount();
  });

  it("drops the old 30-minute default from a workflow's saved settings", async () => {
    const { version: _version, ...unversioned } = DEFAULT_EXECUTION_SETTINGS;
    get.mockResolvedValueOnce({
      data: {
        name: "Old",
        nodes: [],
        edges: [],
        executionSettings: {
          ...unversioned,
          resources: { ...unversioned.resources, maxTime: "PT30M" },
        },
      },
    });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    expect(result.current.executionSettings.resources.maxTime).toBe("");
    unmount();
  });

  it("shows why a workflow can't be loaded", async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    expect(result.current.loadError?.title).toBe("Workflow not found");
    unmount();
  });

  it("saves changes automatically", async () => {
    get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [] } });
    vi.useFakeTimers();
    const props = options();
    const { rerender, unmount } = renderHook(useWorkflowDocument, {
      initialProps: props,
    });
    await flush();
    rerender({ ...props, nodes: [storedNode as Node], isDirty: true });
    expect(put).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(put).toHaveBeenCalledWith("/workflows/wf1", {
      name: "Mine",
      nodes: [
        {
          ...storedNode,
          data: {
            label: "Reads",
            files: [{ name: "a.txt", size: 1, content: "abc" }],
            fileContent: undefined,
            processedContent: undefined,
          },
        },
      ],
      edges: [],
      executionSettings: DEFAULT_EXECUTION_SETTINGS,
    });
    unmount();
  });

  it("keeps an edit made while a save is sent unsaved", async () => {
    get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [] } });
    vi.useFakeTimers();
    let answer: () => void = () => undefined;
    put.mockImplementationOnce(
      () => new Promise((resolve) => { answer = () => resolve({ data: {} }); }),
    );
    const props = options();
    const { rerender, unmount } = renderHook(useWorkflowDocument, { initialProps: props });
    await flush();
    rerender({ ...props, nodes: [storedNode as Node], isDirty: true });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(put).toHaveBeenCalledTimes(1);
    props.setIsDirty.mockClear();
    // Another edit while the save is on its way.
    const moved = { ...storedNode, position: { x: 50, y: 0 } } as Node;
    rerender({ ...props, nodes: [moved], isDirty: true });
    await act(async () => answer());
    expect(props.setIsDirty).not.toHaveBeenCalledWith(false);
    // It goes out with the next save.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(put).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("doesn't retry a failed save until something changes", async () => {
    get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [] } });
    vi.useFakeTimers();
    let fail: () => void = () => undefined;
    put.mockImplementationOnce(
      () => new Promise((_, reject) => { fail = () => reject({ response: { status: 413 } }); }),
    );
    const props = options();
    const { rerender, unmount } = renderHook(useWorkflowDocument, { initialProps: props });
    await flush();
    rerender({ ...props, nodes: [storedNode as Node], isDirty: true });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => fail());
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
    }
    expect(put).toHaveBeenCalledTimes(1);
    expect(props.showError).toHaveBeenCalledTimes(1);

    // The next edit tries again.
    rerender({ ...props, nodes: [{ ...storedNode, position: { x: 9, y: 9 } } as Node], isDirty: true });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(put).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("asks before copying a read-only workflow, then opens the copy", async () => {
    get.mockResolvedValueOnce({
      data: { name: "Demo", nodes: [], edges: [], origin: { readOnly: true } },
    });
    post.mockResolvedValueOnce({ data: { _id: "copy1" } });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    const onCopied = vi.fn();
    let copied: Promise<boolean> = Promise.resolve(false);
    act(() => {
      copied = result.current.requestCopy({ onCopied });
    });
    expect(result.current.isCopyPromptOpen).toBe(true);
    expect(post).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.confirmCopy();
    });
    expect(await copied).toBe(true);
    expect(result.current.isCopyPromptOpen).toBe(false);
    expect(post).toHaveBeenCalledWith("/workflows/wf1/duplicate");
    expect(onCopied).toHaveBeenCalledWith("copy1");
    expect(navigate).toHaveBeenCalledWith("/workflow/copy1", {
      state: { copiedFrom: "Demo", copyName: "Demo Copy" },
    });
    unmount();
  });

  it("asks once for edits made while the question is open", async () => {
    get.mockResolvedValueOnce({
      data: { name: "Demo", nodes: [], edges: [], origin: { readOnly: true } },
    });
    post.mockResolvedValueOnce({ data: { _id: "copy1" } });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.requestCopy();
      second = result.current.requestCopy();
    });
    await act(async () => {
      await result.current.confirmCopy();
    });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("copies nothing and reloads the workflow when the user just looks", async () => {
    get.mockResolvedValue({
      data: { name: "Demo", nodes: [], edges: [], origin: { readOnly: true } },
    });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    let copied: Promise<boolean> = Promise.resolve(true);
    act(() => {
      copied = result.current.requestCopy();
    });
    act(() => result.current.declineCopy());
    await flush();
    expect(await copied).toBe(false);
    expect(result.current.isCopyPromptOpen).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("doesn't ask in an editable workflow", async () => {
    get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [] } });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    let copied = true;
    await act(async () => {
      copied = await result.current.requestCopy();
    });
    expect(copied).toBe(false);
    expect(result.current.isCopyPromptOpen).toBe(false);
    unmount();
  });

  it("puts nodes the user dragged where they were dropped in the copy", async () => {
    get.mockResolvedValueOnce({
      data: { name: "Demo", nodes: [], edges: [], origin: { readOnly: true } },
    });
    const other = { ...storedNode, id: "other" };
    post.mockResolvedValueOnce({
      data: { _id: "copy2", nodes: [storedNode, other] },
    });
    const { result, unmount } = renderHook(useWorkflowDocument, {
      initialProps: options(),
    });
    await flush();
    act(() => {
      void result.current.requestCopy({ positions: { in: { x: 120, y: 60 } } });
    });
    await act(async () => {
      await result.current.confirmCopy();
    });
    expect(put).toHaveBeenCalledWith("/workflows/copy2", {
      nodes: [{ ...storedNode, position: { x: 120, y: 60 } }, other],
    });
    expect(navigate).toHaveBeenCalledWith("/workflow/copy2", expect.anything());
    unmount();
  });

  describe("changes saved elsewhere", () => {
    const sentRevision = (call: number) =>
      (put.mock.calls[call] as unknown as [string, { baseRevision?: number }])[1]
        .baseRevision;
    const conflictError = (revision: number) => ({
      response: { status: 409, data: { message: "Changed elsewhere", revision } },
    });
    const edit = async (
      rerender: (props: ReturnType<typeof options>) => void,
      props: ReturnType<typeof options>,
      x: number,
    ) => {
      rerender({
        ...props,
        nodes: [{ ...storedNode, position: { x, y: 0 } } as Node],
        isDirty: true,
      });
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
    };

    it("saves from the revision it loaded, then from the one it saved", async () => {
      get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [], revision: 3 } });
      put.mockResolvedValueOnce({ data: { revision: 4 } });
      vi.useFakeTimers();
      const props = options();
      const { rerender, unmount } = renderHook(useWorkflowDocument, { initialProps: props });
      await flush();
      await edit(rerender, props, 1);
      await edit(rerender, props, 2);
      expect(sentRevision(0)).toBe(3);
      expect(sentRevision(1)).toBe(4);
      unmount();
    });

    it("doesn't overwrite a newer save: it stops saving and asks", async () => {
      get.mockResolvedValue({ data: { name: "Mine", nodes: [], edges: [], revision: 1 } });
      put.mockRejectedValueOnce(conflictError(2));
      vi.useFakeTimers();
      const props = options();
      const { result, rerender, unmount } = renderHook(useWorkflowDocument, {
        initialProps: props,
      });
      await flush();
      await edit(rerender, props, 1);
      expect(result.current.conflict).toEqual({ storedRevision: 2 });
      expect(props.showError).not.toHaveBeenCalled();
      // No autosave while the user decides.
      await edit(rerender, props, 2);
      expect(put).toHaveBeenCalledTimes(1);

      // Replacing it sends the stored revision as the base.
      put.mockResolvedValueOnce({ data: { revision: 3 } });
      await act(async () => {
        await result.current.overwriteSaved();
      });
      expect(sentRevision(1)).toBe(2);
      expect(result.current.conflict).toBeNull();
      unmount();
    });

    it("loads the saved version, or keeps this one as a copy", async () => {
      get.mockResolvedValue({ data: { name: "Mine", nodes: [], edges: [], revision: 1 } });
      vi.useFakeTimers();
      const props = options();
      const { result, rerender, unmount } = renderHook(useWorkflowDocument, {
        initialProps: props,
      });
      await flush();

      put.mockRejectedValueOnce(conflictError(5));
      await edit(rerender, props, 1);
      expect(result.current.conflict).not.toBeNull();
      await act(async () => result.current.reloadSaved());
      await flush();
      expect(get).toHaveBeenCalledTimes(2);
      expect(result.current.conflict).toBeNull();

      put.mockRejectedValueOnce(conflictError(6));
      await edit(rerender, props, 2);
      post.mockResolvedValueOnce({ data: { _id: "mine2" } });
      await act(async () => {
        await result.current.saveAsCopy();
      });
      expect(post).toHaveBeenCalledWith(
        "/workflows",
        expect.objectContaining({ name: "Mine (my version)" }),
      );
      expect(navigate).toHaveBeenCalledWith("/workflow/mine2");
      unmount();
    });

    it("takes the revision of a custom node update made in this tab", async () => {
      get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [], revision: 2 } });
      put.mockResolvedValue({ data: { revision: 9 } });
      vi.useFakeTimers();
      const props = options();
      const { rerender, unmount } = renderHook(useWorkflowDocument, { initialProps: props });
      await flush();
      announceWorkflowRevisions([
        { id: "other", from: 2, to: 7 },
        { id: "wf1", from: 2, to: 3 },
        { id: "wf1", from: 3, to: 4 },
      ]);
      await edit(rerender, props, 1);
      expect(sentRevision(0)).toBe(4);
      unmount();
    });

    it("isn't a conflict when the newer save was this tab's custom node update", async () => {
      get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [], revision: 2 } });
      vi.useFakeTimers();
      const props = options();
      const { result, rerender, unmount } = renderHook(useWorkflowDocument, {
        initialProps: props,
      });
      await flush();
      // The update lands while the save is on its way.
      put.mockImplementationOnce(async () => {
        announceWorkflowRevisions([{ id: "wf1", from: 2, to: 3 }]);
        throw conflictError(3);
      });
      put.mockResolvedValueOnce({ data: { revision: 4 } });
      await edit(rerender, props, 1);
      expect(result.current.conflict).toBeNull();
      // It goes out again at once, from the new revision.
      expect(sentRevision(1)).toBe(3);
      unmount();
    });

    it("on coming back to the tab, shows a newer save, or asks if there are unsaved changes", async () => {
      get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [], revision: 1 } });
      const props = options();
      const { result, rerender, unmount } = renderHook(useWorkflowDocument, {
        initialProps: props,
      });
      await flush();
      const comeBack = async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await flush();
      };

      // Same revision: nothing happens.
      get.mockResolvedValueOnce({ data: { name: "Mine", nodes: [], edges: [], revision: 1 } });
      await comeBack();
      expect(get).toHaveBeenCalledTimes(2);
      expect(props.setNodes).toHaveBeenCalledTimes(1);

      // Saved elsewhere, nothing unsaved here: shown.
      get.mockResolvedValue({ data: { name: "Mine", nodes: [storedNode], edges: [], revision: 2 } });
      await comeBack();
      expect(props.setNodes).toHaveBeenLastCalledWith([storedNode]);
      expect(result.current.conflict).toBeNull();

      // Saved elsewhere again, with unsaved changes here: a conflict.
      rerender({ ...props, isDirty: true });
      get.mockResolvedValue({ data: { name: "Mine", nodes: [], edges: [], revision: 3 } });
      await comeBack();
      expect(result.current.conflict).toEqual({ storedRevision: 3 });
      unmount();
    });
  });
});

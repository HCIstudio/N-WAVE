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
});

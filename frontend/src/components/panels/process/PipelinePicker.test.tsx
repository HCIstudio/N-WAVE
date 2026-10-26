import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listPipelines = vi.fn();
vi.mock("../../../api/pipelines", () => ({
  listPipelines: () => listPipelines(),
}));

const { default: PipelinePicker, resetPipelineCatalogCache } = await import(
  "./PipelinePicker"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => {});

const CATALOG = {
  pipelines: [
    {
      name: "atacseq",
      description: "ATAC-seq peak-calling and QC analysis pipeline",
      versions: ["2.1.2", "2.1.1"],
      archived: false,
    },
    {
      name: "rnaseq",
      description: "RNA sequencing analysis pipeline",
      versions: ["3.27.0", "3.26.0"],
      archived: false,
    },
  ],
};

// React tracks input values itself; set them the way a user would.
const type = (input: HTMLInputElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("PipelinePicker", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();

  const render = (name = "rnaseq", version = "3.27.0") =>
    act(() =>
      root.render(
        <PipelinePicker
          name={name}
          version={version}
          onChange={onChange}
          fieldClassName=""
        />,
      ),
    );

  beforeEach(() => {
    resetPipelineCatalogCache();
    listPipelines.mockReset();
    onChange.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("searches the pipelines and picks the latest release of one", async () => {
    listPipelines.mockResolvedValue(CATALOG);
    render();
    await flush();

    const input = container.querySelector<HTMLInputElement>('[role="combobox"]');
    expect(input).not.toBeNull();
    act(() => input?.focus());
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);

    type(input as HTMLInputElement, "peak");
    const options = container.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("atacseq");
    expect(options[0].textContent).toContain("2.1.2");

    act(() => {
      options[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("atacseq", "2.1.2");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("offers the pipeline's releases and dev as versions", async () => {
    listPipelines.mockResolvedValue(CATALOG);
    render("rnaseq", "3.26.0");
    await flush();
    const select = container.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "3.27.0 (latest)",
      "3.26.0",
      "dev (latest code)",
    ]);
    expect(select.value).toBe("3.26.0");
    expect(container.textContent).toContain("RNA sequencing analysis pipeline");
    expect(
      container.querySelector('a[href="https://nf-co.re/rnaseq"]'),
    ).not.toBeNull();
  });

  it("explains where to look the name and version up without the list", async () => {
    listPipelines.mockRejectedValue(new Error("Network Error"));
    render();
    await flush();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    expect(container.textContent).toContain(
      "The list of nf-core pipelines couldn't be loaded",
    );
    expect(container.textContent).toContain("the part after nf-core/");
    expect(
      container.querySelector('a[href="https://nf-co.re/pipelines"]'),
    ).not.toBeNull();
  });
});

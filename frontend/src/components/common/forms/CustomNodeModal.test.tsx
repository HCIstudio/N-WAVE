import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredCustomNode } from "../../../registry/customNodes";

const persistCustomNode = vi.fn(async (node: StoredCustomNode) => node);
vi.mock("../../../api/customNodes", () => ({
  persistCustomNode: (node: StoredCustomNode) => persistCustomNode(node),
}));

const { default: CustomNodeModal } = await import("./CustomNodeModal");
const { createStoredCustomNode, parseCustomNodeSource } = await import(
  "../../../registry/customNodes"
);

const setup = (node?: StoredCustomNode | null) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <CustomNodeModal isOpen onClose={onClose} onSaved={onSaved} node={node} />,
  );
  return { user, onClose, onSaved, view };
};

const section = (name: string) =>
  within(
    screen.getByRole("heading", { name }).parentElement as HTMLElement,
  );

const codeField = () => screen.getByLabelText("Nextflow process code");

const replaceSource = async (
  user: ReturnType<typeof userEvent.setup>,
  source: string,
) => {
  await user.clear(codeField());
  await user.click(codeField());
  await user.paste(source);
};

const savedNode = (onSaved: ReturnType<typeof vi.fn>) =>
  onSaved.mock.calls[0][0] as StoredCustomNode;

const filterSource = [
  "process FILTER_READS {",
  "  input:",
  "  path reads",
  "  val min_quality",
  "  output:",
  '  path "*.filtered.fq", emit: filtered',
  "  script:",
  '  """',
  "  filter $reads",
  '  """',
  "}",
].join("\n");

describe("CustomNodeModal", () => {
  beforeEach(() => {
    persistCustomNode.mockReset();
    persistCustomNode.mockImplementation(async (node) => node);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CustomNodeModal isOpen={false} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("saves the example process with its inferred ports", async () => {
    const { user, onClose, onSaved } = setup();
    expect(
      screen.getByRole("heading", { name: "Add Custom Node" }),
    ).toBeTruthy();
    expect(screen.getByText("Process: CUSTOM_PROCESS")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save Node" }));

    expect(persistCustomNode).toHaveBeenCalledTimes(1);
    const node = savedNode(onSaved);
    expect(node.id).toMatch(/^custom_custom_process_\d+$/);
    expect(node.label).toBe("Custom Process");
    expect(node.processName).toBe("CUSTOM_PROCESS");
    expect(node.inputs.map((input) => [input.name, input.kind])).toEqual([
      ["input_file", "path"],
      ["max_lines", "val"],
    ]);
    expect(node.inputs[1]).toMatchObject({
      settingType: "integer",
      defaultValue: "20",
    });
    expect(node.outputs.map((output) => output.emit)).toEqual(["result"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("saves the name, description and icon", async () => {
    const { user, onSaved } = setup();
    const name = screen.getAllByLabelText("Name")[0];
    await user.clear(name);
    await user.type(name, "Head lines");
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "Keeps the top");
    await user.click(screen.getByRole("button", { name: "Dna" }));

    expect(screen.getByRole("button", { name: "Dna" }).getAttribute("aria-pressed")).toBe("true");
    // The preview shows the new name.
    expect(screen.getAllByText("Head lines").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(savedNode(onSaved)).toMatchObject({
      label: "Head lines",
      description: "Keeps the top",
      icon: "Dna",
    });
  });

  it("reads the ports again when the code changes", async () => {
    const { user, onSaved } = setup();
    await replaceSource(user, filterSource);

    expect(screen.getByText("Process: FILTER_READS")).toBeTruthy();
    expect(section("File Inputs").getByDisplayValue("reads")).toBeTruthy();
    expect(
      section("Settings").getByDisplayValue("min_quality"),
    ).toBeTruthy();
    expect(
      section("Outputs").getAllByDisplayValue("filtered").length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    const node = savedNode(onSaved);
    expect(node.processName).toBe("FILTER_READS");
    expect(node.source).toBe(filterSource);
    expect(node.inputs.map((input) => input.name)).toEqual([
      "reads",
      "min_quality",
    ]);
  });

  it("refuses code without a process", async () => {
    const { user, onSaved } = setup();
    await replaceSource(user, "echo hello");

    expect(screen.getByText("Process: not inferred")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(
      screen.getByText(
        "The Nextflow code must contain a process or named workflow declaration.",
      ),
    ).toBeTruthy();
    expect(persistCustomNode).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("needs at least one file input", async () => {
    const { user } = setup();
    await replaceSource(
      user,
      'process ONLY_VALUES {\n  input:\n  val name\n  output:\n  path "o.txt", emit: o\n}',
    );

    expect(screen.getByText("No file inputs inferred.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(
      screen.getByText("Add at least one file input."),
    ).toBeTruthy();
    expect(persistCustomNode).not.toHaveBeenCalled();
  });

  it("names definitions the code declares but the node lacks", async () => {
    const { user } = setup();
    const files = section("File Inputs");
    await user.clear(files.getByLabelText("Handle"));
    await user.type(files.getByLabelText("Handle"), "renamed");
    await user.click(section("Settings").getByLabelText("Remove setting 1"));
    const outputs = section("Outputs");
    await user.clear(outputs.getByLabelText("Handle"));
    await user.type(outputs.getByLabelText("Handle"), "other");
    await user.clear(outputs.getByLabelText("Emit Name"));
    await user.type(outputs.getByLabelText("Emit Name"), "other");

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(
      screen.getByText(
        "The Nextflow code declares missing definitions for file input: input_file; setting: max_lines; output: result. Add matching definitions or update the process code before saving.",
      ),
    ).toBeTruthy();
    expect(persistCustomNode).not.toHaveBeenCalled();
  });

  it("warns once about settings the code doesn't use", async () => {
    const { user, onSaved } = setup();
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    expect(screen.getByText("Setting 2")).toBeTruthy();

    const save = screen.getByRole("button", { name: "Save Node" });
    await user.click(save);
    expect(
      screen.getByText(
        "The following settings are not declared as val inputs in the Nextflow code and will be ignored during workflow execution: setting.",
      ),
    ).toBeTruthy();
    expect(persistCustomNode).not.toHaveBeenCalled();

    await user.click(save);
    expect(persistCustomNode).toHaveBeenCalledTimes(1);
    expect(savedNode(onSaved).inputs.map((input) => input.name)).toEqual([
      "input_file",
      "max_lines",
      "setting",
    ]);
  });

  it("asks again after the draft changes", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(screen.getByText(/Click Save again/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add file input" }));
    expect(screen.queryByText(/Click Save again/)).toBeNull();
  });

  it("adds and removes file inputs and outputs", async () => {
    const { user } = setup();
    const files = section("File Inputs");
    expect((files.getByLabelText("Remove file input 1") as HTMLButtonElement).disabled).toBe(true);
    await user.click(files.getByRole("button", { name: "Add file input" }));
    expect(files.getByText("File Input 2")).toBeTruthy();
    await user.click(files.getByLabelText("Remove file input 2"));
    expect(files.queryByText("File Input 2")).toBeNull();

    const outputs = section("Outputs");
    expect((outputs.getByLabelText("Remove output 1") as HTMLButtonElement).disabled).toBe(true);
    await user.click(outputs.getByRole("button", { name: "Add output" }));
    expect(outputs.getByText("Output 2")).toBeTruthy();
    await user.click(outputs.getByLabelText("Remove output 1"));
    expect(outputs.queryByText("Output 2")).toBeNull();
    expect(outputs.getAllByDisplayValue("out")).toHaveLength(2);
  });

  it("saves file types, patterns and output emits", async () => {
    const { user, onSaved } = setup();
    const files = section("File Inputs");
    await user.clear(files.getByLabelText("Label"));
    await user.type(files.getByLabelText("Label"), "Text file");
    await user.clear(files.getByLabelText("File Type"));
    await user.type(files.getByLabelText("File Type"), "TXT");
    await user.clear(files.getByLabelText("File Pattern"));
    await user.type(files.getByLabelText("File Pattern"), "*.txt");

    const outputs = section("Outputs");
    await user.click(outputs.getByRole("button", { name: "Add output" }));
    const emits = outputs.getAllByLabelText("Emit Name");
    await user.clear(emits[1]);
    await user.type(emits[1], "log");
    await user.clear(outputs.getAllByLabelText("File Type")[1]);
    await user.type(outputs.getAllByLabelText("File Type")[1], "LOG");
    await user.clear(outputs.getAllByLabelText("File Pattern")[1]);
    await user.type(outputs.getAllByLabelText("File Pattern")[1], "*.log");

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    const node = savedNode(onSaved);
    expect(node.inputs[0]).toMatchObject({
      label: "Text file",
      fileType: "TXT",
      filePattern: "*.txt",
    });
    expect(node.outputs[1]).toEqual({
      name: "out",
      emit: "log",
      label: "log",
      fileType: "LOG",
      filePattern: "*.log",
    });
  });

  it("edits setting types, defaults and options", async () => {
    const { user, onSaved } = setup();
    const settings = section("Settings");
    await user.clear(settings.getByLabelText("Label"));
    await user.type(settings.getByLabelText("Label"), "Lines");
    expect(settings.getByDisplayValue("20").getAttribute("type")).toBe("number");

    const type = settings.getByLabelText("Type");
    await user.selectOptions(type, "boolean");
    const booleanDefault = settings.getAllByRole("combobox")[1];
    expect((booleanDefault as HTMLInputElement).value).toBe("false");
    await user.selectOptions(booleanDefault, "true");
    expect((booleanDefault as HTMLInputElement).value).toBe("true");

    await user.selectOptions(type, "select");
    const options = settings.getByPlaceholderText(/option_a/);
    expect((options as HTMLInputElement).value).toBe("option_a\noption_b");
    await user.clear(options);
    await user.type(options, "fast{Enter}slow");
    const selectDefault = settings.getAllByRole("combobox")[1];
    expect((selectDefault as HTMLInputElement).value).toBe("fast");
    await user.selectOptions(selectDefault, "slow");

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    expect(savedNode(onSaved).inputs[1]).toMatchObject({
      name: "max_lines",
      label: "Lines",
      settingType: "select",
      options: ["fast", "slow"],
      defaultValue: "slow",
    });
  });

  it("uses a decimal field for float settings", async () => {
    const { user } = setup();
    const settings = section("Settings");
    await user.selectOptions(settings.getByLabelText("Type"), "float");
    const field = settings.getByPlaceholderText("0.75");
    expect(field.getAttribute("type")).toBe("number");
    expect(field.getAttribute("step")).toBe("any");
    await user.clear(field);
    await user.type(field, "0.5");
    expect((field as HTMLInputElement).valueAsNumber).toBe(0.5);

    await user.selectOptions(settings.getByLabelText("Type"), "text");
    expect(settings.getByDisplayValue("0.5").getAttribute("type")).toBe("text");
  });

  it("renames a setting", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Remove setting 1" }));
    expect(screen.getByText("No settings inferred.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add setting" }));
    const name = section("Settings").getByPlaceholderText("max_lines");
    await user.clear(name);
    await user.type(name, "max_lines");

    await user.click(screen.getByRole("button", { name: "Save Node" }));
    // The renamed setting matches the code again, so no warning.
    expect(screen.queryByText(/Click Save again/)).toBeNull();
    expect(persistCustomNode).toHaveBeenCalledTimes(1);
  });

  it("shows why saving failed and stays open", async () => {
    persistCustomNode.mockRejectedValueOnce(new Error("Disk full"));
    const { user, onClose, onSaved } = setup();
    await user.click(screen.getByRole("button", { name: "Save Node" }));

    expect(await screen.findByText("Disk full")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save Node" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows parse warnings", async () => {
    const { user } = setup();
    await replaceSource(
      user,
      'process ODD {\n  input:\n  path reads\n  env TOKEN\n  output:\n  path "o", emit: o\n}',
    );
    expect(screen.getByText(/Could not infer input/)).toBeTruthy();
  });

  it("closes from the close and cancel buttons", async () => {
    const { user, onClose } = setup();
    await user.click(
      screen.getByRole("button", { name: "Close custom node dialog" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(persistCustomNode).not.toHaveBeenCalled();
  });

  it("edits an existing node and keeps its id", async () => {
    const parsed = parseCustomNodeSource(filterSource);
    const existing = createStoredCustomNode(
      {
        label: "Filter",
        description: "Drops bad reads",
        icon: "Scissors",
        source: filterSource,
      },
      parsed,
      {
        inputs: parsed.inputs.map((input) =>
          input.name === "reads" ? { ...input, label: "FASTQ reads" } : input,
        ),
        outputs: parsed.outputs,
      },
    );
    const { user, onSaved } = setup(existing);

    expect(
      screen.getByRole("heading", { name: "Edit Custom Node" }),
    ).toBeTruthy();
    expect((screen.getAllByLabelText("Name")[0] as HTMLInputElement).value).toBe("Filter");
    expect(screen.getByRole("button", { name: "Scissors" }).getAttribute("aria-pressed")).toBe("true");
    // The stored port labels are kept, not re-inferred from the code.
    expect(
      section("File Inputs").getByDisplayValue("FASTQ reads"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    const node = savedNode(onSaved);
    expect(node.id).toBe(existing.id);
    expect(node.createdAt).toBe(existing.createdAt);
    expect(node.inputs[0].label).toBe("FASTQ reads");
  });
});

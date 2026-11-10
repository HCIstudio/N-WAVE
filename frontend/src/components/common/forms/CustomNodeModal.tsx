import type React from "react";
import { useEffect, useMemo, useState, useId } from "react";
import DynamicIcon from "../ui/DynamicIcon";
import { persistCustomNode } from "../../../api/customNodes";
import {
  createStoredCustomNode,
  parseCustomNodeSource,
  type CustomNodeInput,
  type CustomNodeOutput,
  type CustomNodeSettingType,
  type ParsedCustomNodeSource,
  type StoredCustomNode,
} from "../../../registry/customNodes";
import { getErrorMessage } from "../../../utils/errors";

interface CustomNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (node: StoredCustomNode) => void;
  node?: StoredCustomNode | null;
}

const iconOptions = [
  "Code",
  "Terminal",
  "Cog",
  "Dna",
  "FileCode",
  "FlaskConical",
  "Microscope",
  "Package",
  "Scissors",
  "Wand",
];

const defaultSource = `process CUSTOM_PROCESS {
    input:
    path input_file
    val max_lines

    output:
    path "result.txt", emit: result

    script:
    """
    head -n $max_lines $input_file > result.txt
    """
}`;

const CustomNodeModal: React.FC<CustomNodeModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  node,
}) => {
  // Prefix for label/input id pairs, unique per component instance.
  const fieldId = useId();
  const [label, setLabel] = useState(node?.label ?? "Custom Process");
  const [description, setDescription] = useState(
    node?.description ?? "User-defined Nextflow process."
  );
  const [icon, setIcon] = useState(node?.icon ?? "Code");
  const [source, setSource] = useState(node?.source ?? defaultSource);
  const parsed = useMemo(() => parseCustomNodeSource(source), [source]);
  const [fileInputs, setFileInputs] = useState<CustomNodeInput[]>(
    getFileInputs(parsed.inputs)
  );
  const [settings, setSettings] = useState<CustomNodeInput[]>(
    getSettings(parsed.inputs)
  );
  const [outputs, setOutputs] = useState<CustomNodeOutput[]>(parsed.outputs);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(node?.label ?? "Custom Process");
    setDescription(node?.description ?? "User-defined Nextflow process.");
    setIcon(node?.icon ?? "Code");
    const initialSource = node?.source ?? defaultSource;
    const initialParsed = parseCustomNodeSource(initialSource);
    setSource(initialSource);
    setFileInputs(getFileInputs(node?.inputs ?? initialParsed.inputs));
    setSettings(getSettings(node?.inputs ?? initialParsed.inputs));
    setOutputs(node?.outputs ?? initialParsed.outputs);
  }, [isOpen, node]);

  useEffect(() => {
    if (!isOpen) return;
    if (node && source === node.source) return;
    setFileInputs(getFileInputs(parsed.inputs));
    setSettings(getSettings(parsed.inputs));
    setOutputs(parsed.outputs);
  }, [isOpen, node, parsed, source]);

  // Any edit to the draft invalidates a previously shown save warning.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the draft fields are change triggers.
  useEffect(() => {
    setSaveWarning(null);
    setWarningAcknowledged(false);
  }, [source, fileInputs, settings, outputs]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setError(null);
    if (!parsed.processName) {
      setError(
        "The Nextflow code must contain a process or named workflow declaration."
      );
      return;
    }
    if (fileInputs.length === 0) {
      setError("Add at least one file input.");
      return;
    }
    if (outputs.length === 0) {
      setError("Add at least one output handle.");
      return;
    }

    const inputs = [...fileInputs, ...settings];
    const integrityResult = validateDefinitionsAgainstSource(parsed, {
      fileInputs,
      settings,
      outputs,
    });
    if (integrityResult.error) {
      setError(integrityResult.error);
      setSaveWarning(null);
      setWarningAcknowledged(false);
      return;
    }
    if (integrityResult.warning && !warningAcknowledged) {
      setSaveWarning(integrityResult.warning);
      setWarningAcknowledged(true);
      return;
    }

    const storedNode = createStoredCustomNode(
      { label, description, icon, source },
      parsed,
      { inputs, outputs },
      node ?? undefined
    );

    try {
      setIsSaving(true);
      const savedNode = await persistCustomNode(storedNode);
      onSaved(savedNode);
      onClose();
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "Failed to save custom node."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[88vh] w-[min(1120px,calc(100vw-2rem))] flex-col rounded-md border border-accent bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-accent px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-text">
              {node ? "Edit Custom Node" : "Add Custom Node"}
            </h2>
            <p className="text-xs text-text-light">
              Create a reusable visual node from a Nextflow process.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-text-light hover:bg-accent hover:text-text"
            aria-label="Close custom node dialog"
          >
            <DynamicIcon name="X" className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldId}-name`} className="mb-1 block text-sm font-medium text-text">
                  Name
                </label>
                <input
                  id={`${fieldId}-name`}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-md border border-accent bg-background p-2 text-sm text-text"
                />
              </div>
              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-text">
                  Icon
                </legend>
                <div className="grid grid-cols-5 gap-1">
                  {iconOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setIcon(option)}
                      title={option}
                      aria-label={option}
                      aria-pressed={icon === option}
                      className={`flex h-9 items-center justify-center rounded-md border ${
                        icon === option
                          ? "border-nextflow-green bg-nextflow-green/10 text-nextflow-green"
                          : "border-accent text-text-light hover:bg-accent hover:text-text"
                      }`}
                    >
                      <DynamicIcon name={option} className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div>
              <label htmlFor={`${fieldId}-description`} className="mb-1 block text-sm font-medium text-text">
                Description
              </label>
              <input
                id={`${fieldId}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-md border border-accent bg-background p-2 text-sm text-text"
              />
            </div>

            <div>
              <label htmlFor={`${fieldId}-nextflow-process-code`} className="mb-1 block text-sm font-medium text-text">
                Nextflow process code
              </label>
              <textarea
                id={`${fieldId}-nextflow-process-code`}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full rounded-md border border-accent bg-background p-3 font-mono text-xs text-text"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-accent p-3">
              <div className="flex items-center gap-2">
                <DynamicIcon name={icon} className="h-5 w-5 text-text" />
                <div>
                  <p className="text-sm font-semibold text-text">{label}</p>
                  <p className="text-xs text-text-light">
                    {parsed.kind === "workflow" ? "Workflow" : "Process"}:{" "}
                    {parsed.processName || "not inferred"}
                  </p>
                </div>
              </div>
            </div>

            <EditableFileInputs inputs={fileInputs} onChange={setFileInputs} />
            <EditableSettings settings={settings} onChange={setSettings} />
            <EditableOutputs outputs={outputs} onChange={setOutputs} />

            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-900/20 p-3 text-xs text-yellow-100">
                {parsed.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            {saveWarning && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-900/20 p-3 text-xs text-yellow-100">
                <p>{saveWarning}</p>
                <p className="mt-1">
                  Click Save again to keep these unused settings anyway.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-900/20 p-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-accent px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-nextflow-green px-3 py-2 text-sm font-medium text-white hover:bg-nextflow-green-dark"
          >
            {isSaving ? "Saving..." : node ? "Save Changes" : "Save Node"}
          </button>
        </div>
      </div>
    </div>
  );
};

const getFileInputs = (inputs: CustomNodeInput[]): CustomNodeInput[] =>
  inputs.filter((input) => input.kind === "path");

const getSettings = (inputs: CustomNodeInput[]): CustomNodeInput[] =>
  inputs.filter((input) => input.kind === "val");

const FIELD = "w-full rounded-md border border-accent bg-background p-2 text-sm text-text";
const CAPTION = "mb-1 block text-[11px] uppercase tracking-wide text-text-light";

/** The list with entry `index` changed. */
const updateAt = <T,>(list: T[], index: number, change: (entry: T) => T): T[] =>
  list.map((entry, entryIndex) => (entryIndex === index ? change(entry) : entry));

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="block">
    <span className={CAPTION}>{label}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} className={FIELD} placeholder={placeholder} />
  </label>
);

/**
 * An editable list of definitions: a card per entry with a remove button,
 * and a button that adds one. `keepOne`: the last entry can't be removed.
 */
const DefinitionList = <T,>({
  title,
  noun,
  entries,
  onChange,
  keepOne,
  empty,
  added,
  children,
}: {
  title: string;
  noun: string;
  entries: T[];
  onChange: (entries: T[]) => void;
  keepOne: boolean;
  empty?: string;
  added: T;
  children: (entry: T, update: (change: (entry: T) => T) => void) => React.ReactNode;
}) => {
  const Noun = noun.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      <div className="space-y-2">
        {entries.map((entry, index) => {
          const lastOne = keepOne && entries.length <= 1;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Parsed, editable definitions have no immutable draft ID; index keys preserve the existing editing behavior.
              key={`${noun}-${index}`}
              className="rounded-md border border-accent bg-background/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-text-light">
                  {`${Noun} ${index + 1}`}
                </p>
                <button
                  type="button"
                  onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}
                  disabled={lastOne}
                  className="rounded-md p-1 text-text-light hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-light"
                  title={lastOne ? `At least one ${noun} is required` : `Remove ${noun}`}
                  aria-label={`Remove ${noun} ${index + 1}`}
                >
                  <DynamicIcon name="Trash2" className="h-4 w-4" />
                </button>
              </div>
              {children(entry, (change) => onChange(updateAt(entries, index, change)))}
            </div>
          );
        })}
        {entries.length === 0 && empty && <p className="text-sm text-text-light">{empty}</p>}
        <button
          type="button"
          onClick={() => onChange([...entries, added])}
          className="text-sm text-nextflow-green hover:underline"
        >
          Add {noun}
        </button>
      </div>
    </div>
  );
};

const EditableFileInputs: React.FC<{
  inputs: CustomNodeInput[];
  onChange: (inputs: CustomNodeInput[]) => void;
}> = ({ inputs, onChange }) => (
  <DefinitionList
    title="File Inputs"
    noun="file input"
    entries={inputs}
    onChange={onChange}
    keepOne
    empty="No file inputs inferred."
    added={{ name: "input", label: "Input", kind: "path", fileType: "", filePattern: "" }}
  >
    {(input, update) => (
      <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField label="Handle" value={input.name} placeholder="name" onChange={(name) => update((i) => ({ ...i, name }))} />
          <TextField label="Label" value={input.label} onChange={(label) => update((i) => ({ ...i, label }))} />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField
            label="File Type"
            value={input.fileType ?? ""}
            placeholder="FASTQ"
            onChange={(fileType) => update((i) => ({ ...i, fileType }))}
          />
          <TextField
            label="File Pattern"
            value={input.filePattern ?? ""}
            placeholder="*.fastq.gz"
            onChange={(filePattern) => update((i) => ({ ...i, filePattern }))}
          />
        </div>
      </>
    )}
  </DefinitionList>
);

const EditableSettings: React.FC<{
  settings: CustomNodeInput[];
  onChange: (settings: CustomNodeInput[]) => void;
}> = ({ settings, onChange }) => (
  <DefinitionList
    title="Settings"
    noun="setting"
    entries={settings}
    onChange={onChange}
    keepOne={false}
    empty="No settings inferred."
    added={{ name: "setting", label: "Setting", kind: "val", defaultValue: "", settingType: "text" }}
  >
    {(setting, update) => (
      <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField label="Name" value={setting.name} placeholder="max_lines" onChange={(name) => update((s) => ({ ...s, name }))} />
          <TextField
            label="Label"
            value={setting.label}
            placeholder="Max Lines"
            onChange={(label) => update((s) => ({ ...s, label }))}
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className={CAPTION}>Type</span>
            <select
              value={setting.settingType ?? "text"}
              onChange={(event) => {
                const settingType = event.target.value as CustomNodeSettingType;
                update((s) => ({
                  ...s,
                  settingType,
                  defaultValue: settingType === "boolean" ? "false" : (s.defaultValue ?? ""),
                  options: settingType === "select" ? (s.options ?? ["option_a", "option_b"]) : s.options,
                }));
              }}
              className={FIELD}
            >
              <option value="text">Text</option>
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="boolean">Boolean</option>
              <option value="select">Selection</option>
              <option value="expression">Groovy expression</option>
            </select>
          </label>
          <fieldset className="block">
            <legend className={CAPTION}>Default Value</legend>
            <SettingDefaultInput setting={setting} onChange={(defaultValue) => update((s) => ({ ...s, defaultValue }))} />
          </fieldset>
        </div>
        {setting.settingType === "select" && (
          <fieldset className="mt-2 block">
            <legend className={CAPTION}>Options</legend>
            <SelectOptionsEditor
              options={setting.options ?? []}
              onChange={(options) =>
                update((s) => ({
                  ...s,
                  options,
                  defaultValue: options.includes(s.defaultValue ?? "") ? s.defaultValue : (options[0] ?? ""),
                }))
              }
            />
            <span className="mt-1 block text-xs text-text-light">Enter one selectable option per line.</span>
          </fieldset>
        )}
      </>
    )}
  </DefinitionList>
);

const EditableOutputs: React.FC<{
  outputs: CustomNodeOutput[];
  onChange: (outputs: CustomNodeOutput[]) => void;
}> = ({ outputs, onChange }) => (
  <DefinitionList
    title="Outputs"
    noun="output"
    entries={outputs}
    onChange={onChange}
    keepOne
    added={{ name: "out", emit: "out", label: "Output", fileType: "", filePattern: "" }}
  >
    {(output, update) => (
      <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField label="Handle" value={output.name} placeholder="handle" onChange={(name) => update((o) => ({ ...o, name }))} />
          <TextField
            label="Emit Name"
            value={output.emit}
            placeholder="emit"
            onChange={(emit) => update((o) => ({ ...o, emit, label: emit }))}
          />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextField
            label="File Type"
            value={output.fileType ?? ""}
            placeholder="TXT"
            onChange={(fileType) => update((o) => ({ ...o, fileType }))}
          />
          <TextField
            label="File Pattern"
            value={output.filePattern ?? ""}
            placeholder="*.txt"
            onChange={(filePattern) => update((o) => ({ ...o, filePattern }))}
          />
        </div>
      </>
    )}
  </DefinitionList>
);

const SelectOptionsEditor: React.FC<{
  options: string[];
  onChange: (options: string[]) => void;
}> = ({ options, onChange }) => {
  const [rawOptions, setRawOptions] = useState(options.join("\n"));

  return (
    <textarea
      value={rawOptions}
      onChange={(event) => {
        const nextValue = event.target.value;
        setRawOptions(nextValue);
        onChange(
          nextValue
            .split(/\r?\n/)
            .map((option) => option.trim())
            .filter(Boolean)
        );
      }}
      rows={3}
      className={FIELD}
      placeholder={"option_a\noption_b\noption_c"}
    />
  );
};

const validateDefinitionsAgainstSource = (
  parsed: ParsedCustomNodeSource,
  definitions: {
    fileInputs: CustomNodeInput[];
    settings: CustomNodeInput[];
    outputs: CustomNodeOutput[];
  }
): { error: string | null; warning: string | null } => {
  const fileInputNames = new Set(
    definitions.fileInputs.map((input) => input.name.trim()).filter(Boolean)
  );
  const settingNames = new Set(
    definitions.settings.map((setting) => setting.name.trim()).filter(Boolean)
  );
  const outputNames = new Set(
    definitions.outputs
      .flatMap((output) => [output.name.trim(), output.emit.trim()])
      .filter(Boolean)
  );
  const parsedSettingNames = new Set<string>();

  const missingFileInputs = new Set<string>();
  const missingSettings = new Set<string>();
  for (const argument of parsed.arguments) {
    for (const field of argument.fields) {
      if (field.meta) continue;
      if (field.kind === "val") parsedSettingNames.add(field.name);
      if (field.kind === "path" && !fileInputNames.has(field.name)) {
        missingFileInputs.add(field.name);
      }
      if (field.kind === "val" && !settingNames.has(field.name)) {
        missingSettings.add(field.name);
      }
    }
  }

  const missingOutputs = parsed.outputs
    .map((output) => output.emit || output.name)
    .filter(Boolean)
    .filter((name) => !outputNames.has(name));

  const messages: string[] = [];
  if (missingFileInputs.size > 0) {
    messages.push(`file input: ${Array.from(missingFileInputs).join(", ")}`);
  }
  if (missingSettings.size > 0) {
    messages.push(`setting: ${Array.from(missingSettings).join(", ")}`);
  }
  if (missingOutputs.length > 0) {
    messages.push(`output: ${missingOutputs.join(", ")}`);
  }

  const error =
    messages.length === 0
      ? null
      : `The Nextflow code declares missing definitions for ${messages.join(
          "; "
        )}. Add matching definitions or update the process code before saving.`;

  const unusedSettings = definitions.settings
    .map((setting) => setting.name.trim())
    .filter(Boolean)
    .filter((name) => !parsedSettingNames.has(name));
  const warning =
    unusedSettings.length === 0
      ? null
      : `The following settings are not declared as val inputs in the Nextflow code and will be ignored during workflow execution: ${unusedSettings.join(
          ", "
        )}.`;

  return { error, warning };
};

const SettingDefaultInput: React.FC<{
  setting: CustomNodeInput;
  onChange: (value: string) => void;
}> = ({ setting, onChange }) => {
  const className = FIELD;
  const type = setting.settingType ?? "text";

  if (type === "boolean") {
    return (
      <select
        value={setting.defaultValue === "true" ? "true" : "false"}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        <option value="false">False</option>
        <option value="true">True</option>
      </select>
    );
  }

  if (type === "select") {
    const options = setting.options ?? [];
    return (
      <select
        value={setting.defaultValue ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        <option value="">No default</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={type === "integer" || type === "float" ? "number" : "text"}
      step={type === "integer" ? "1" : type === "float" ? "any" : undefined}
      value={setting.defaultValue ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      placeholder={type === "integer" ? "20" : type === "float" ? "0.75" : ""}
    />
  );
};

export default CustomNodeModal;

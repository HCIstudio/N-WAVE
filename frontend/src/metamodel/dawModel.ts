// A workflow as an instance of the consolidated metamodel of data analysis
// workflows (DAWs) by Hilbrich et al. (2022, doi:10.1007/978-3-031-19756-7_12;
// https://github.com/CRC-FONDA/T1-DAW-Metamodel): a DAW made of Tasks,
// Storages and the Interconnections between them, with sub-DAWs.
//
// The metamodel is a UML class diagram and has no file format of its own, so
// this is N-WAVE's JSON form of it (daw-model.schema.json). Each element says
// which class of the metamodel it is (`type`). What N-WAVE needs to give its
// own canvas back exactly is kept apart, in `nwave` (other tools ignore it;
// a model without it opens as a skeleton, see fromDawModel.ts).

export const DAW_SCHEMA = "n-wave-daw/1";

export const DAW_METAMODEL = {
  name: "Consolidated metamodel of data analysis workflow specification languages",
  citation:
    "Hilbrich, M., Müller, S., Kulagina, S., Lazik, C., De Mecquenem, N., Grunske, L.: A Consolidated View on Specification Languages for Data Analysis Workflows. ISoLA 2022, LNCS 13702, pp. 201–215.",
  doi: "10.1007/978-3-031-19756-7_12",
  repository: "https://github.com/CRC-FONDA/T1-DAW-Metamodel",
} as const;

/** Task and its sub-types; "Task" itself is a solution idea without an implementation yet. */
export const TASK_TYPES = [
  "Task",
  "Executable",
  "InlineDescription",
  "Monitor",
  "SkipTask",
  "RepeatTask",
  "FullInterconnectionManipulation",
] as const;
export type DawTaskType = (typeof TASK_TYPES)[number];

export const STORAGE_TYPES = [
  "Storage",
  "FileStorage",
  "DatabaseStorage",
  "IntermediateStorage",
  "InteractiveStorage",
] as const;
export type DawStorageType = (typeof STORAGE_TYPES)[number];

export const INTERCONNECTION_TYPES = [
  "Interconnection",
  "StreamingInterconnection",
  "SimpleSendDataInterconnection",
  "ControlflowInterconnection",
] as const;
export type DawInterconnectionType = (typeof INTERCONNECTION_TYPES)[number];

/** Where data goes into or comes out of an element (the metamodel connects elements; N-WAVE also says where). */
export interface DawPort {
  name: string;
  label?: string;
}

/** What N-WAVE keeps to give its own node back: its type, settings and place on the canvas. */
export interface NwaveNode {
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  /** Its place among the workflow's nodes. */
  index: number;
}

/** ExecutionContext: what the task needs where it runs. */
export interface DawExecutionContext {
  /** The container image the task runs in. */
  container?: string;
  /** Settings of the workflow system for this task, as it writes them (Nextflow: process config). */
  config?: string[];
  /** The workflow system the context is written for. */
  engine?: string;
}

export interface DawTask {
  id: string;
  name: string;
  type: DawTaskType;
  description?: string;
  inputs?: DawPort[];
  outputs?: DawPort[];
  /** The solution: code in a language, or a reference to it (an nf-core module). */
  implementation?: {
    language: string;
    code?: string;
    reference?: string;
  };
  executionContext?: DawExecutionContext;
  nwave?: NwaveNode;
}

export interface DawStorage {
  id: string;
  name: string;
  type: DawStorageType;
  description?: string;
  inputs?: DawPort[];
  outputs?: DawPort[];
  /** The files it holds, by name (their content stays in `nwave`). */
  files?: string[];
  /** The values it holds (parameters). */
  values?: Array<{ name: string; type: string; value: string }>;
  nwave?: NwaveNode;
}

export interface DawInterconnection {
  id: string;
  type: DawInterconnectionType;
  from: { element: string; port?: string };
  to: { element: string; port?: string };
  nwave?: { index: number; data?: Record<string, unknown> };
}

export interface Daw {
  id: string;
  name: string;
  description?: string;
  /** A DAW defined elsewhere (an nf-core subworkflow or pipeline), when its parts aren't listed here. */
  reference?: string;
  inputs?: DawPort[];
  outputs?: DawPort[];
  tasks: DawTask[];
  storages: DawStorage[];
  interconnections: DawInterconnection[];
  /** Sub-DAWs. */
  daws: Daw[];
  executionContext?: DawExecutionContext;
  /** A sub-DAW that is one node on N-WAVE's canvas (with `reference`). */
  nwave?: NwaveNode;
}

export interface DawModelFile {
  schema: typeof DAW_SCHEMA;
  metamodel: typeof DAW_METAMODEL | Record<string, unknown>;
  generator?: { name: string };
  daw: Daw;
  /** What the metamodel has no class for: notes on the canvas, and the workflow's run settings. */
  nwave?: {
    notes?: NwaveNode[];
    executionSettings?: Record<string, unknown>;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Whether text looks like a DAW model (JSON with its schema), before reading it. */
export const looksLikeDawModel = (text: string): boolean => {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) && typeof parsed.schema === "string" && parsed.schema.startsWith("n-wave-daw/");
  } catch {
    return false;
  }
};

const readPorts = (value: unknown, where: string): DawPort[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${where} must be a list of ports.`);
  return value.map((port, index) => {
    if (!isRecord(port) || !nonEmptyString(port.name)) throw new Error(`${where}[${index}] needs a name.`);
    return { name: port.name, ...(typeof port.label === "string" ? { label: port.label } : {}) };
  });
};

const readNwaveNode = (value: unknown): NwaveNode | undefined => {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.data)) return undefined;
  const position = isRecord(value.position) ? value.position : {};
  return {
    type: value.type,
    data: value.data,
    position: { x: Number(position.x) || 0, y: Number(position.y) || 0 },
    index: Number.isFinite(Number(value.index)) ? Number(value.index) : Number.MAX_SAFE_INTEGER,
  };
};

const readExecutionContext = (value: unknown): DawExecutionContext | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    ...(typeof value.container === "string" ? { container: value.container } : {}),
    ...(Array.isArray(value.config) ? { config: value.config.filter((line): line is string => typeof line === "string") } : {}),
    ...(typeof value.engine === "string" ? { engine: value.engine } : {}),
  };
};

/**
 * Read a DAW model from JSON text. Throws with what is wrong (and where)
 * when it isn't one; `warnings` says what was read differently than written.
 */
export const readDawModel = (text: string): { model: DawModelFile; warnings: string[] } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The DAW model isn't valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("The DAW model must be a JSON object.");
  if (parsed.schema !== DAW_SCHEMA) {
    throw new Error(
      typeof parsed.schema === "string" && parsed.schema.startsWith("n-wave-daw/")
        ? `This DAW model is in the format ${parsed.schema}; this version of N-WAVE reads ${DAW_SCHEMA}.`
        : `The file has no "schema": "${DAW_SCHEMA}", so it isn't a DAW model N-WAVE can read.`,
    );
  }
  const warnings: string[] = [];
  const ids = new Set<string>();
  const takeId = (value: unknown, where: string): string => {
    if (!nonEmptyString(value)) throw new Error(`${where} needs an id.`);
    if (ids.has(value)) throw new Error(`The id “${value}” is used twice (${where}).`);
    ids.add(value);
    return value;
  };
  const typeOf = <T extends string>(value: unknown, known: readonly T[], fallback: T, where: string): T => {
    if (typeof value === "string" && (known as readonly string[]).includes(value)) return value as T;
    warnings.push(`${where} has the type “${String(value)}”, which the metamodel doesn't have; read as ${fallback}.`);
    return fallback;
  };
  const list = (value: unknown, where: string): unknown[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`${where} must be a list.`);
    return value;
  };
  const nameOf = (value: Record<string, unknown>, id: string) => (nonEmptyString(value.name) ? value.name : id);

  const pending: Array<{ interconnection: DawInterconnection; where: string }> = [];
  const readDaw = (value: unknown, where: string, depth: number): Daw => {
    if (!isRecord(value)) throw new Error(`${where} must be an object.`);
    if (depth > 20) throw new Error("The DAW model nests sub-DAWs too deeply.");
    const id = takeId(value.id, where);
    const tasks = list(value.tasks, `${where}.tasks`).map((entry, index): DawTask => {
      const at = `${where}.tasks[${index}]`;
      if (!isRecord(entry)) throw new Error(`${at} must be an object.`);
      const taskId = takeId(entry.id, at);
      const implementation = isRecord(entry.implementation) ? entry.implementation : null;
      const nwave = readNwaveNode(entry.nwave);
      const context = readExecutionContext(entry.executionContext);
      return {
        id: taskId,
        name: nameOf(entry, taskId),
        type: typeOf(entry.type, TASK_TYPES, "Task", at),
        ...(typeof entry.description === "string" ? { description: entry.description } : {}),
        ...(entry.inputs !== undefined ? { inputs: readPorts(entry.inputs, `${at}.inputs`) } : {}),
        ...(entry.outputs !== undefined ? { outputs: readPorts(entry.outputs, `${at}.outputs`) } : {}),
        ...(implementation
          ? {
              implementation: {
                language: typeof implementation.language === "string" ? implementation.language : "",
                ...(typeof implementation.code === "string" ? { code: implementation.code } : {}),
                ...(typeof implementation.reference === "string" ? { reference: implementation.reference } : {}),
              },
            }
          : {}),
        ...(context ? { executionContext: context } : {}),
        ...(nwave ? { nwave } : {}),
      };
    });
    const storages = list(value.storages, `${where}.storages`).map((entry, index): DawStorage => {
      const at = `${where}.storages[${index}]`;
      if (!isRecord(entry)) throw new Error(`${at} must be an object.`);
      const storageId = takeId(entry.id, at);
      const nwave = readNwaveNode(entry.nwave);
      return {
        id: storageId,
        name: nameOf(entry, storageId),
        type: typeOf(entry.type, STORAGE_TYPES, "Storage", at),
        ...(typeof entry.description === "string" ? { description: entry.description } : {}),
        ...(entry.inputs !== undefined ? { inputs: readPorts(entry.inputs, `${at}.inputs`) } : {}),
        ...(entry.outputs !== undefined ? { outputs: readPorts(entry.outputs, `${at}.outputs`) } : {}),
        ...(Array.isArray(entry.files) ? { files: entry.files.filter((file): file is string => typeof file === "string") } : {}),
        ...(Array.isArray(entry.values)
          ? {
              values: entry.values.filter(isRecord).map((item) => ({
                name: String(item.name ?? ""),
                type: String(item.type ?? "text"),
                value: String(item.value ?? ""),
              })),
            }
          : {}),
        ...(nwave ? { nwave } : {}),
      };
    });
    const daws = list(value.daws, `${where}.daws`).map((entry, index) => readDaw(entry, `${where}.daws[${index}]`, depth + 1));
    const interconnections = list(value.interconnections, `${where}.interconnections`).map((entry, index): DawInterconnection => {
      const at = `${where}.interconnections[${index}]`;
      if (!isRecord(entry) || !isRecord(entry.from) || !isRecord(entry.to)) throw new Error(`${at} needs “from” and “to”.`);
      if (!nonEmptyString(entry.from.element) || !nonEmptyString(entry.to.element)) {
        throw new Error(`${at} must name the elements it connects (from.element, to.element).`);
      }
      const nwave = isRecord(entry.nwave) ? entry.nwave : null;
      const interconnection: DawInterconnection = {
        id: nonEmptyString(entry.id) ? entry.id : `${at}`,
        type: typeOf(entry.type, INTERCONNECTION_TYPES, "Interconnection", at),
        from: { element: entry.from.element, ...(typeof entry.from.port === "string" ? { port: entry.from.port } : {}) },
        to: { element: entry.to.element, ...(typeof entry.to.port === "string" ? { port: entry.to.port } : {}) },
        ...(nwave
          ? {
              nwave: {
                index: Number.isFinite(Number(nwave.index)) ? Number(nwave.index) : Number.MAX_SAFE_INTEGER,
                ...(isRecord(nwave.data) ? { data: nwave.data } : {}),
              },
            }
          : {}),
      };
      pending.push({ interconnection, where: at });
      return interconnection;
    });
    const nwave = readNwaveNode(value.nwave);
    const context = readExecutionContext(value.executionContext);
    return {
      id,
      name: nameOf(value, id),
      ...(typeof value.description === "string" ? { description: value.description } : {}),
      ...(typeof value.reference === "string" ? { reference: value.reference } : {}),
      ...(value.inputs !== undefined ? { inputs: readPorts(value.inputs, `${where}.inputs`) } : {}),
      ...(value.outputs !== undefined ? { outputs: readPorts(value.outputs, `${where}.outputs`) } : {}),
      tasks,
      storages,
      interconnections,
      daws,
      ...(context ? { executionContext: context } : {}),
      ...(nwave ? { nwave } : {}),
    };
  };

  const daw = readDaw(parsed.daw, "daw", 0);
  for (const { interconnection, where } of pending) {
    for (const end of [interconnection.from.element, interconnection.to.element]) {
      if (!ids.has(end)) throw new Error(`${where} connects “${end}”, which the model doesn't have.`);
    }
  }
  const extension = isRecord(parsed.nwave) ? parsed.nwave : null;
  const notes = extension && Array.isArray(extension.notes) ? extension.notes.map(readNwaveNode).filter((note): note is NwaveNode => Boolean(note)) : [];
  return {
    model: {
      schema: DAW_SCHEMA,
      metamodel: isRecord(parsed.metamodel) ? parsed.metamodel : DAW_METAMODEL,
      ...(isRecord(parsed.generator) && typeof parsed.generator.name === "string" ? { generator: { name: parsed.generator.name } } : {}),
      daw,
      ...(extension
        ? {
            nwave: {
              ...(notes.length > 0 ? { notes } : {}),
              ...(isRecord(extension.executionSettings) ? { executionSettings: extension.executionSettings } : {}),
            },
          }
        : {}),
    },
    warnings,
  };
};

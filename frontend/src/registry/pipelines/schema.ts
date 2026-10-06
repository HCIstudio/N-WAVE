// nf-core pipeline parameters from a pipeline's `nextflow_schema.json`
// (JSON Schema draft-07 with `definitions`, or 2020-12 with `$defs`):
// grouped form fields, the values to launch with, and validation.

export type PipelineParamType = "string" | "boolean" | "integer" | "number";

export interface PipelineParam {
  name: string;
  type: PipelineParamType;
  /** nf-schema formats: file-path, directory-path, path, file-path-pattern. */
  format?: string;
  description: string;
  helpText?: string;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  required: boolean;
  hidden: boolean;
  pattern?: string;
  errorMessage?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface PipelineParamGroup {
  id: string;
  title: string;
  description: string;
  params: PipelineParam[];
}

/** A form value as entered: unset params are missing or "". */
export type PipelineParamValue = string | number | boolean;
export type PipelineParamValues = Record<string, PipelineParamValue>;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toType = (type: unknown): PipelineParamType => {
  const types = Array.isArray(type) ? type : [type];
  // e.g. `help: ["boolean", "string"]`: a string also holds "true".
  if (types.includes("string")) return "string";
  if (types.includes("integer")) return "integer";
  if (types.includes("number")) return "number";
  if (types.includes("boolean")) return "boolean";
  return "string";
};

const toParam = (
  name: string,
  property: JsonObject,
  required: boolean,
): PipelineParam => {
  const optional = <T>(key: string, check: (value: unknown) => boolean) =>
    check(property[key]) ? (property[key] as T) : undefined;
  const isNumber = (value: unknown) => typeof value === "number";
  const isString = (value: unknown) => typeof value === "string";
  return {
    name,
    type: toType(property.type),
    format: optional<string>("format", isString),
    description: optional<string>("description", isString) ?? "",
    helpText: optional<string>("help_text", isString),
    default: optional<PipelineParamValue>(
      "default",
      (value) =>
        isString(value) || isNumber(value) || typeof value === "boolean",
    ),
    enum: optional<Array<string | number>>("enum", Array.isArray),
    required,
    hidden: property.hidden === true,
    pattern: optional<string>("pattern", isString),
    errorMessage: optional<string>("errorMessage", isString),
    minimum: optional<number>("minimum", isNumber),
    maximum: optional<number>("maximum", isNumber),
    minLength: optional<number>("minLength", isNumber),
    maxLength: optional<number>("maxLength", isNumber),
  };
};

const toGroup = (id: string, definition: JsonObject): PipelineParamGroup => {
  const properties = isObject(definition.properties)
    ? definition.properties
    : {};
  const required = new Set(
    Array.isArray(definition.required) ? definition.required : [],
  );
  return {
    id,
    title: typeof definition.title === "string" ? definition.title : id,
    description:
      typeof definition.description === "string" ? definition.description : "",
    params: Object.entries(properties)
      .filter(([, property]) => isObject(property))
      .map(([name, property]) =>
        toParam(name, property as JsonObject, required.has(name)),
      ),
  };
};

/**
 * The parameter groups of a pipeline schema, in the order of its `allOf`
 * references, followed by unreferenced groups and top-level properties.
 */
export const parsePipelineSchema = (schema: unknown): PipelineParamGroup[] => {
  if (!isObject(schema))
    throw new Error("The pipeline schema isn't a JSON object.");
  const definitions = {
    ...(isObject(schema.definitions) ? schema.definitions : {}),
    ...(isObject(schema.$defs) ? schema.$defs : {}),
  } as Record<string, unknown>;

  const referenced = (Array.isArray(schema.allOf) ? schema.allOf : [])
    .map((entry) =>
      isObject(entry) && typeof entry.$ref === "string"
        ? entry.$ref.replace(/^#\/(\$defs|definitions)\//, "")
        : "",
    )
    .filter((id) => isObject(definitions[id]));
  const ids = [
    ...referenced,
    ...Object.keys(definitions).filter(
      (id) => !referenced.includes(id) && isObject(definitions[id]),
    ),
  ];

  const groups = ids.map((id) => toGroup(id, definitions[id] as JsonObject));
  if (isObject(schema.properties)) {
    const ungrouped = toGroup("other_parameters", {
      title: "Other parameters",
      properties: schema.properties,
      required: schema.required,
    });
    if (ungrouped.params.length > 0) groups.push(ungrouped);
  }
  return groups.filter((group) => group.params.length > 0);
};

/** Params that take a file or directory (paths, URLs, uploaded files). */
export const isPathParam = (param: PipelineParam): boolean =>
  param.format === "file-path" ||
  param.format === "directory-path" ||
  param.format === "path" ||
  param.format === "file-path-pattern";

/** All params of the groups, by name. */
export const paramsByName = (
  groups: PipelineParamGroup[],
): Map<string, PipelineParam> =>
  new Map(
    groups.flatMap((group) => group.params.map((param) => [param.name, param])),
  );

const isUnset = (value: PipelineParamValue | undefined): boolean =>
  value === undefined || (typeof value === "string" && value.trim() === "");

/** A form value converted to the param's type, or undefined if unset. */
export const coerceParamValue = (
  param: PipelineParam,
  value: PipelineParamValue | undefined,
): PipelineParamValue | undefined => {
  if (isUnset(value)) return undefined;
  switch (param.type) {
    case "boolean":
      return value === true || value === "true";
    case "integer":
    case "number": {
      const number = Number(value);
      return Number.isFinite(number) ? number : String(value);
    }
    default:
      return String(value).trim();
  }
};

/**
 * The params to launch with: set values that differ from the schema's
 * default, converted to the param types. Unknown names are kept as given
 * (pipeline params missing from the schema still reach the pipeline).
 */
export const buildPipelineParams = (
  groups: PipelineParamGroup[],
  values: PipelineParamValues,
): Record<string, PipelineParamValue> => {
  const params = paramsByName(groups);
  const result: Record<string, PipelineParamValue> = {};
  for (const [name, raw] of Object.entries(values)) {
    const param = params.get(name);
    const value = param ? coerceParamValue(param, raw) : raw;
    if (value === undefined || isUnset(value)) continue;
    if (param && param.default !== undefined && value === param.default)
      continue;
    result[name] = value;
  }
  return result;
};

export interface PipelineParamIssue {
  param: string;
  message: string;
}

/**
 * Check values against the schema. `provided` are params N-WAVE sets itself
 * (outdir, connected inputs); with `testProfile`, the pipeline's test profile
 * supplies the required inputs.
 */
export const validatePipelineParams = (
  groups: PipelineParamGroup[],
  values: PipelineParamValues,
  {
    provided = new Set<string>(),
    testProfile = false,
  }: { provided?: Set<string>; testProfile?: boolean } = {},
): PipelineParamIssue[] => {
  const issues: PipelineParamIssue[] = [];
  for (const param of groups.flatMap((group) => group.params)) {
    if (provided.has(param.name)) continue;
    const value = coerceParamValue(param, values[param.name]);
    if (value === undefined) {
      if (param.required && param.default === undefined && !testProfile) {
        issues.push({
          param: param.name,
          message: `--${param.name} is required.`,
        });
      }
      continue;
    }
    if (param.type === "integer" || param.type === "number") {
      if (
        typeof value !== "number" ||
        (param.type === "integer" && !Number.isInteger(value))
      ) {
        issues.push({
          param: param.name,
          message: `--${param.name} must be ${param.type === "integer" ? "a whole number" : "a number"}.`,
        });
        continue;
      }
      if (param.minimum !== undefined && value < param.minimum) {
        issues.push({
          param: param.name,
          message: `--${param.name} must be at least ${param.minimum}.`,
        });
      }
      if (param.maximum !== undefined && value > param.maximum) {
        issues.push({
          param: param.name,
          message: `--${param.name} must be at most ${param.maximum}.`,
        });
      }
    }
    if (param.enum && !param.enum.includes(value as string | number)) {
      issues.push({
        param: param.name,
        message: `--${param.name} must be one of: ${param.enum.join(", ")}.`,
      });
      continue;
    }
    if (typeof value === "string") {
      if (param.minLength !== undefined && value.length < param.minLength) {
        issues.push({
          param: param.name,
          message: `--${param.name} is too short.`,
        });
      }
      if (param.maxLength !== undefined && value.length > param.maxLength) {
        issues.push({
          param: param.name,
          message: `--${param.name} is too long.`,
        });
      }
      if (param.pattern && !matches(param.pattern, value)) {
        issues.push({
          param: param.name,
          message:
            param.errorMessage ??
            `--${param.name} doesn't match ${param.pattern}.`,
        });
      }
    }
  }
  return issues;
};

/** JSON Schema patterns are ECMA regexes; skip ones this engine rejects. */
const matches = (pattern: string, value: string): boolean => {
  try {
    return new RegExp(pattern, "u").test(value);
  } catch {
    return true;
  }
};

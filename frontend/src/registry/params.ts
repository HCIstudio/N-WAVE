// Workflow parameters (Parameters node): named values that become
// `params.<name>` in the script and in the exported nextflow.config, and
// reference files (genome FASTA, GTF, indexes) that other nodes connect to.

export type WorkflowParameterType = "text" | "number" | "boolean" | "file";

export interface WorkflowParameter {
  name: string;
  type: WorkflowParameterType;
  /** For files: an uploaded file name, an absolute path or a URL. */
  value: string;
  description?: string;
}

export interface ParameterIssue {
  level: "error" | "warning";
  name: string;
  message: string;
}

/** Params N-WAVE itself declares; parameters can't reuse these names. */
export const RESERVED_PARAM_NAMES = new Set([
  "outdir",
  "inputdir",
  "selected_files",
  "max_cpus",
  "max_memory",
  "max_time",
]);

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Absolute paths and URLs (https://, s3://, ...) are used as they are. */
const isRemoteOrAbsolute = (path: string): boolean =>
  /^(\/|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/.test(path);

/** The parameters stored on a node, keeping only well-formed entries. */
export const getNodeParameters = (
  data: Record<string, unknown>,
): WorkflowParameter[] =>
  Array.isArray(data.parameters)
    ? (data.parameters as WorkflowParameter[]).filter(
        (parameter) =>
          parameter &&
          typeof parameter.name === "string" &&
          ["text", "number", "boolean", "file"].includes(parameter.type),
      )
    : [];

/** Output ports of a Parameters node: one per reference file. */
export const getParameterPorts = (parameters: WorkflowParameter[]) =>
  parameters
    .filter(
      (parameter) =>
        parameter.type === "file" && PARAM_NAME.test(parameter.name),
    )
    .map((parameter) => ({
      name: parameter.name,
      label: parameter.name,
      isConnectable: true,
    }));

/**
 * Validate a node's parameters. `otherNames` are parameter names declared by
 * other Parameters nodes; `uploadedFiles` are File Input file names.
 */
export const validateParameters = (
  parameters: WorkflowParameter[],
  otherNames: string[] = [],
  uploadedFiles: string[] = [],
): ParameterIssue[] => {
  const issues: ParameterIssue[] = [];
  const seen = new Set<string>();
  const others = new Set(otherNames);
  const uploaded = new Set(uploadedFiles);

  for (const parameter of parameters) {
    const { name } = parameter;
    if (!PARAM_NAME.test(name)) {
      issues.push({
        level: "error",
        name,
        message: `"${name}" isn't a valid name: use letters, digits and _, not starting with a digit.`,
      });
      continue;
    }
    if (RESERVED_PARAM_NAMES.has(name) || name.startsWith("samplesheet_")) {
      issues.push({
        level: "error",
        name,
        message: `params.${name} is used by N-WAVE; choose another name.`,
      });
    }
    if (seen.has(name) || others.has(name)) {
      issues.push({
        level: "error",
        name,
        message: `params.${name} is declared more than once.`,
      });
    }
    seen.add(name);

    if (
      parameter.type === "number" &&
      !Number.isFinite(Number(parameter.value))
    ) {
      issues.push({
        level: "error",
        name,
        message: `params.${name} must be a number.`,
      });
    }
    if (parameter.type === "file") {
      const value = parameter.value.trim();
      if (!value) {
        issues.push({
          level: "error",
          name,
          message: `params.${name} needs a file: an uploaded file name, an absolute path or a URL.`,
        });
      } else if (!isRemoteOrAbsolute(value) && !uploaded.has(value)) {
        issues.push({
          level: "warning",
          name,
          message: `"${value}" isn't uploaded; add it to a File Input node, or use an absolute path or URL.`,
        });
      }
    }
  }
  return issues;
};

const singleQuoted = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** Groovy literal for a parameter's value (script and config). */
export const parameterLiteral = (parameter: WorkflowParameter): string => {
  switch (parameter.type) {
    case "number": {
      const number = Number(parameter.value);
      return Number.isFinite(number) ? String(number) : "0";
    }
    case "boolean":
      return String(parameter.value) === "true" ? "true" : "false";
    default:
      return singleQuoted(String(parameter.value ?? "").trim());
  }
};

const PARAM_REFERENCE = /\$\{params\.[A-Za-z_][A-Za-z0-9_]*\}/;

/**
 * A Groovy string for text that may reference parameters, e.g.
 * `--genome ${params.genome}`: a double-quoted GString when it does, with
 * every other `$`, `"` and `\` escaped; a plain single-quoted string
 * otherwise.
 */
export const groovyStringWithParams = (value: string): string => {
  if (!PARAM_REFERENCE.test(value)) return singleQuoted(value);
  const parts = value.split(/(\$\{params\.[A-Za-z_][A-Za-z0-9_]*\})/);
  return `"${parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\$/g, "\\$"),
    )
    .join("")}"`;
};

/** True when text references `${params.<name>}`. */
export const referencesParams = (value: string): boolean =>
  PARAM_REFERENCE.test(value);

/**
 * Code for a Parameters node: script defaults (`params.x = ...`), config
 * lines for the `params { }` block, and one channel per reference file.
 * Uploaded references are resolved in the input directory.
 */
export const generateParameterDeclarations = (
  parameters: WorkflowParameter[],
  channelNameFor: (parameter: WorkflowParameter) => string,
): { script: string; config: string[]; channels: string } => {
  const valid = parameters.filter(
    (parameter) =>
      PARAM_NAME.test(parameter.name) &&
      !RESERVED_PARAM_NAMES.has(parameter.name) &&
      !parameter.name.startsWith("samplesheet_"),
  );
  return {
    script: valid
      .map(
        (parameter) =>
          `params.${parameter.name} = ${parameterLiteral(parameter)}\n`,
      )
      .join(""),
    config: valid.map(
      (parameter) => `${parameter.name} = ${parameterLiteral(parameter)}`,
    ),
    channels: valid
      .filter((parameter) => parameter.type === "file")
      .map((parameter) => {
        const param = `params.${parameter.name}`;
        return `${channelNameFor(parameter)} = Channel.of(file(${param} ==~ /^(\\/|[A-Za-z][A-Za-z0-9+.-]*:\\/\\/).*/ ? ${param} : "\${params.inputdir}/\${${param}}", checkIfExists: true))\n`;
      })
      .join(""),
  };
};

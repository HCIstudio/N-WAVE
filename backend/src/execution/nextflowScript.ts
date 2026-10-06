// Pure transformations applied to the generated Nextflow script before it is
// executed. Kept free of I/O so they can be unit tested.

export const buildExecutionConfig = (
  generatedConfig: string,
  enableDocker: boolean
): string => {
  const configBlocks = [generatedConfig.trim()].filter(Boolean);

  if (enableDocker) {
    configBlocks.push(
      [
        "docker {",
        "  enabled = true",
        "  // Run as the calling user, like exported projects and nf-core",
        "  // pipelines, so images with a non-root user can write task files.",
        "  runOptions = '-u $(id -u):$(id -g)'",
        "}",
        "",
        "process {",
        "  executor = 'local'",
        "}",
      ].join("\n")
    );
  }

  return configBlocks.join("\n\n");
};

export const extractNwaveNextflowAssets = (
  script: string
): { script: string; config: string } => {
  const configBlocks: string[] = [];
  const cleanedScript = script.replace(
    /\/\*\s*N-WAVE_NEXTFLOW_CONFIG\s*([\s\S]*?)\*\//g,
    (_match, configBlock: string) => {
      configBlocks.push(configBlock.trim());
      return "";
    }
  );

  return {
    script: cleanedScript,
    config: configBlocks.filter(Boolean).join("\n\n"),
  };
};

export const normalizeLegacyGeneratedScript = (script: string): string => {
  assertNoLegacyBioinformaticsTemplates(script);

  let normalizedScript = addLegacyFileInputAliases(script);
  normalizedScript = addLegacyProcessOutputAliases(normalizedScript);
  return normalizedScript;
};

const assertNoLegacyBioinformaticsTemplates = (script: string): void => {
  if (
    script.includes("Installing FastQC dependencies") ||
    script.includes("Downloading FastQC") ||
    script.includes("Downloading Trimmomatic") ||
    script.includes("trimmomatic-0.39.jar")
  ) {
    throw new Error(
      "Generated workflow uses a legacy inline FastQC/Trimmomatic template. " +
        "The frontend is not using the current nf-core node generator. " +
        "Rebuild and restart the frontend container/dev server, then create a new FastQC/Trimmomatic node."
    );
  }
};

const addLegacyFileInputAliases = (script: string): string => {
  if (!/\bch_files\b/.test(script)) return script;

  const referencedAliases = Array.from(
    new Set(
      [...script.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*_ch_files_out)\b/g)].map(
        (match) => match[1]
      )
    )
  ).filter(
    (alias): alias is string => Boolean(alias)
  ).filter(
    (alias) =>
      !new RegExp(`^\\s*${escapeRegExp(alias)}\\s*=`, "m").test(script)
  );

  if (referencedAliases.length === 0) return script;

  const aliasBlock = referencedAliases
    .map((alias) => `${alias} = ch_files`)
    .join("\n");

  const workflowIndex = script.indexOf("\nworkflow {");
  if (workflowIndex === -1) {
    return `${script}\n\n${aliasBlock}\n`;
  }

  return `${script.slice(0, workflowIndex)}\n${aliasBlock}\n${script.slice(
    workflowIndex
  )}`;
};

const addLegacyProcessOutputAliases = (script: string): string => {
  const aliasLines: string[] = [];
  const tupleAssignmentPattern =
    /^\s*\(([^)]+)\)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/gm;

  for (const match of script.matchAll(tupleAssignmentPattern)) {
    const assignedVars = (match[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const assignedVar of assignedVars) {
      const aliasMatch = assignedVar.match(
        /^(?:[A-Za-z0-9]+_)?node_([0-9]+)_(.+)$/
      );
      if (!aliasMatch) continue;

      const alias = `node_${aliasMatch[1]}_${aliasMatch[2]}`;
      if (alias === assignedVar) continue;
      if (!new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(script)) continue;
      if (new RegExp(`^\\s*${escapeRegExp(alias)}\\s*=`, "m").test(script)) {
        continue;
      }

      aliasLines.push(`    ${alias} = ${assignedVar}`);
    }
  }

  const uniqueAliasLines = Array.from(new Set(aliasLines));
  if (uniqueAliasLines.length === 0) return script;

  return script.replace(
    /^(\s*\([^)]+\)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^\n]*\)\s*)$/m,
    `$1\n${uniqueAliasLines.join("\n")}`
  );
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getReferencedNfCoreModules = (script: string): string[] => {
  const modules = new Set<string>();
  const includePattern =
    /from\s+['"]\.\/modules\/nf-core\/([A-Za-z0-9_/-]+)\/main['"]/g;

  for (const match of script.matchAll(includePattern)) {
    const moduleName = match[1];
    if (!moduleName) {
      continue;
    }
    if (
      !/^[A-Za-z0-9_/-]+$/.test(moduleName) ||
      moduleName.split("/").some((segment) => !segment || segment === "..")
    ) {
      throw new Error(`Invalid nf-core module name: ${moduleName}`);
    }
    modules.add(moduleName);
  }

  return Array.from(modules);
};

export const stabilizeWorkflowInvocations = (script: string): string => {
  if (script.includes("N-WAVE generator: registry-nfcore-v1")) {
    return script;
  }

  const lines = script.split(/\r?\n/);
  const workflowStart = lines.findIndex((line) => line.trim() === "workflow {");
  const workflowEnd = lines.lastIndexOf("}");
  if (workflowStart === -1 || workflowEnd <= workflowStart) return script;

  const header = lines.slice(0, workflowStart + 1);
  const workflowBody = lines.slice(workflowStart + 1, workflowEnd);
  const footer = lines.slice(workflowEnd);

  const isTrackedVariable = (name: string): boolean =>
    name.startsWith("ch_") || name.startsWith("node_");

  const variableDefinitions = new Map<string, string>();

  // Variables defined outside workflow scope (e.g. Channel declarations) are valid
  // inputs for workflow invocations and must be included in the dependency graph.
  for (const line of lines.slice(0, workflowStart)) {
    const trimmed = line.trim();
    const declarationMatch = trimmed.match(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*.+$/
    );
    if (!declarationMatch) continue;

    const declaredName = declarationMatch[1] ?? "";
    const declaration = sanitizeVarName(declaredName);
    if (declaration && isTrackedVariable(declaration)) {
      variableDefinitions.set(declaration, line);
    }
  }

  const invocationRecords: Array<{
    text: string;
    definitions: string[];
    usages: string[];
    isCommentOrEmpty: boolean;
  }> = [];
  const otherLines: string[] = [];
  let skipNextChainedLine = false;
  let skipDuplicateChannelLine = false;

  const invocationRegex = /\(.*\)/;

  for (const line of workflowBody) {
    const trimmed = line.trim();
    if (skipDuplicateChannelLine) {
      if (trimmed.startsWith(".")) {
        continue;
      }
      skipDuplicateChannelLine = false;
    }

    if (trimmed === "" || trimmed.startsWith("//")) {
      otherLines.push(line);
      if (!trimmed) {
        skipNextChainedLine = false;
      }
      continue;
    }

    if (skipNextChainedLine) {
      if (trimmed.startsWith(".")) {
        continue;
      }
      skipNextChainedLine = false;
    }

    const isChannelDeclaration = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Channel\./.test(
      trimmed
    );
    if (isChannelDeclaration) {
      skipDuplicateChannelLine = true;
      continue;
    }

    const { definitions, usages } = parseWorkflowInvocation(line);
    if (
      definitions.length > 0 ||
      usages.length > 0 ||
      invocationRegex.test(trimmed)
    ) {
      invocationRecords.push({
        text: line,
        definitions,
        usages,
        isCommentOrEmpty: false,
      });
    } else {
      otherLines.push(line);
    }
  }

  const variableUsages = new Map<string, string[]>();

  for (const record of invocationRecords) {
    for (const definition of record.definitions) {
      if (isTrackedVariable(definition)) {
        variableDefinitions.set(definition, record.text);
      }
    }
    for (const usedVar of record.usages) {
      if (!isTrackedVariable(usedVar)) continue;
      const dependents = variableUsages.get(usedVar) ?? [];
      dependents.push(record.text);
      variableUsages.set(usedVar, dependents);
    }
  }

  const sortedInvocations: string[] = [];
  const processed = new Set<string>();
  const processing = new Set<string>();

  const addInvocation = (invocationText: string): void => {
    if (processed.has(invocationText)) return;
    if (processing.has(invocationText)) return;

    processing.add(invocationText);
    const record = invocationRecords.find((r) => r.text === invocationText);
    for (const usedVar of record?.usages ?? []) {
      const definingInvocation = variableDefinitions.get(usedVar);
      if (definingInvocation && !processed.has(definingInvocation)) {
        addInvocation(definingInvocation);
      }
    }

    processing.delete(invocationText);
    if (!sortedInvocations.includes(invocationText)) {
      sortedInvocations.push(invocationText);
    }
    processed.add(invocationText);
  };

  for (const record of invocationRecords) {
    addInvocation(record.text);
  }

  for (const [variable, dependents] of variableUsages) {
    if (!variableDefinitions.has(variable)) {
      console.warn(
        `Could not resolve workflow variable "${variable}" used in: ${dependents.join(
          " | "
        )}. Treating as external input.`
      );
    }
  }

  const workflowOutput = [
    ...otherLines.filter(
      (line) => line.trim() === "" || line.trim().startsWith("//")
    ),
    ...sortedInvocations,
  ];
  const workflowOutputLines = workflowOutput.join("\n").split(/\r?\n/);

  const sanitizedWorkflowOutput: string[] = [];
  let skipChannelDeclarationContinuation = false;
  for (const line of workflowOutputLines) {
    const trimmed = line.trim();

    if (skipChannelDeclarationContinuation) {
      if (trimmed.startsWith(".")) {
        continue;
      }
      skipChannelDeclarationContinuation = false;
    }

    const isChannelDeclaration =
      /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*Channel\./.test(trimmed);
    const isChannelFromList = trimmed.includes("Channel.fromList(");
    if (isChannelDeclaration || isChannelFromList) {
      skipChannelDeclarationContinuation = true;
      continue;
    }

    if (trimmed.startsWith(".")) {
      continue;
    }

    sanitizedWorkflowOutput.push(line);
  }

  return [...header, ...sanitizedWorkflowOutput, ...footer].join("\n");
};

const parseWorkflowInvocation = (line: string): {
  definitions: string[];
  usages: string[];
} => {
  const definitions: string[] = [];
  const usages: string[] = [];
  const trimmed = line.trim();

  const tupleDefinitionMatch = trimmed.match(/^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/);
  if (tupleDefinitionMatch) {
    const tupleDefs = tupleDefinitionMatch[1] ?? "";
    for (const rawName of tupleDefs.split(",")) {
      const name = sanitizeVarName(rawName.trim());
      if (name.startsWith("ch_") || name.startsWith("node_")) {
        definitions.push(name);
      }
    }
  } else {
    const definitionMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (definitionMatch) {
      const definitionName = definitionMatch[1] ?? "";
      const name = sanitizeVarName(definitionName);
      if (
        name &&
        (name.startsWith("ch_") || name.startsWith("node_"))
      ) {
        definitions.push(name);
      }
    }
  }

  for (const arg of getInvocationArguments(line)) {
    if (!usages.includes(arg)) usages.push(arg);
  }

  return { definitions, usages };
};

const getInvocationArguments = (line: string): string[] => {
  const trimmed = line.trim();
  const assignmentIndex = trimmed.indexOf("=");
  const rhs = assignmentIndex === -1 ? trimmed : trimmed.substring(assignmentIndex + 1);
  const candidatePattern = /\b[A-Za-z_][A-Za-z0-9_]*(?:_[A-Za-z0-9_]+)*\b/g;
  const lhsDefinitions = new Set<string>();
  const tupleDefinitionMatch = trimmed.match(/^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/);
  const tupleDefinitions = tupleDefinitionMatch?.[1];
  if (tupleDefinitions) {
    for (const rawName of tupleDefinitions.split(",")) {
      const name = sanitizeVarName(rawName.trim());
      if (name) lhsDefinitions.add(name);
    }
  } else {
    const definitionMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const definitionName = definitionMatch?.[1];
    if (definitionName) {
      lhsDefinitions.add(sanitizeVarName(definitionName));
    }
  }

  const args: string[] = [];

  for (const match of rhs.matchAll(candidatePattern)) {
    const rawName = match[0];
    const arg = sanitizeVarName(rawName);
    if (!arg || lhsDefinitions.has(arg)) {
      continue;
    }

    const startIndex = match.index;
    const endIndex = startIndex + rawName.length;
    const previousChar = startIndex > 0 ? rhs.charAt(startIndex - 1) : "";
    const nextNonWhitespaceChar =
      rhs.slice(endIndex).match(/^\s*(.)/)?.[1] ?? "";

    if (previousChar === ".") {
      continue;
    }

    if (nextNonWhitespaceChar === "(") {
      continue;
    }

    if (
      (arg.startsWith("ch_") || arg.startsWith("node_")) &&
      !args.includes(arg)
    ) {
      args.push(arg);
    }
  }

  return args;
};

const sanitizeVarName = (name: string): string => {
  if (typeof name !== "string") return "";
  let sanitized = name.replace(/[-\s]+/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `v_${sanitized}`;
  }
  return sanitized;
};

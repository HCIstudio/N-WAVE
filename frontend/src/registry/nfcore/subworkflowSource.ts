// Reading nf-core subworkflow sources (main.nf): what they include and their
// `take`/`emit` sections. Mirrors the catalog parser in
// scripts/nfcoreSubworkflowParser.mjs, for code that only has the source:
// project export and custom nodes made from a subworkflow.

/** Modules ("salmon/quant") and subworkflows ("bam_stats_samtools") included. */
export interface SubworkflowIncludes {
  modules: string[];
  subworkflows: string[];
}

const INCLUDE = /^\s*include\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;
const MODULE_PATH =
  /^(?:\.\.\/)+modules\/nf-core\/([a-z0-9_/-]+?)(?:\/main(?:\.nf)?)?$/;
const SUBWORKFLOW_PATH =
  /^\.\.\/(?:\.\.\/nf-core\/)?([a-z0-9_]+)(?:\/main(?:\.nf)?)?$/;

/** The nf-core modules and subworkflows a subworkflow's main.nf includes. */
export const getSubworkflowIncludes = (mainNf: string): SubworkflowIncludes => {
  const modules = new Set<string>();
  const subworkflows = new Set<string>();
  for (const match of mainNf.matchAll(INCLUDE)) {
    const target = match[2] ?? "";
    const module = target.match(MODULE_PATH)?.[1];
    const subworkflow = target.match(SUBWORKFLOW_PATH)?.[1];
    if (module) modules.add(module);
    else if (subworkflow) subworkflows.add(subworkflow);
  }
  return {
    modules: Array.from(modules).sort(),
    subworkflows: Array.from(subworkflows).sort(),
  };
};

/**
 * Rewrite a subworkflow's include statements so they work from the
 * project root (where main.nf lives) instead of
 * subworkflows/nf-core/<name>/: `'../../../modules/nf-core/salmon/quant'`
 * -> `'./modules/nf-core/salmon/quant/main'`. Returns the rewritten
 * includes and the source without them. Includes N-WAVE doesn't know are
 * left in the source.
 */
export const extractRootIncludes = (
  source: string,
): { includes: string[]; source: string } => {
  const includes: string[] = [];
  const rest = source.replace(INCLUDE, (statement, names: string, target) => {
    const module = String(target).match(MODULE_PATH)?.[1];
    const subworkflow = String(target).match(SUBWORKFLOW_PATH)?.[1];
    const path = module
      ? `./modules/nf-core/${module}/main`
      : subworkflow
        ? `./subworkflows/nf-core/${subworkflow}/main`
        : null;
    if (!path) return statement;
    includes.push(
      `include { ${names.trim().replace(/\s+/g, " ")} } from '${path}'`,
    );
    return "";
  });
  return { includes, source: rest.replace(/\n{3,}/g, "\n\n").trim() };
};

export interface WorkflowSignature {
  /** "" when the source declares no named workflow. */
  name: string;
  takes: Array<{ name: string; comment: string }>;
  emits: string[];
}

/** Drop a trailing `// comment` (outside quotes); returns code and comment. */
const splitComment = (line: string): { code: string; comment: string } => {
  let quote = "";
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "/" && line[index + 1] === "/") {
      return {
        code: line.slice(0, index).trim(),
        comment: line
          .slice(index)
          .replace(/^\/\/+\s*/, "")
          .trim(),
      };
    }
  }
  return { code: line.trim(), comment: "" };
};

/** The name, takes and emits of the first named workflow in `source`. */
export const parseWorkflowSignature = (source: string): WorkflowSignature => {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^\s*workflow\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line),
  );
  if (start === -1) return { name: "", takes: [], emits: [] };

  const name =
    lines[start].match(/workflow\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "";
  const takes: WorkflowSignature["takes"] = [];
  const emits: string[] = [];
  let section: "take" | "emit" | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\}/.test(line)) break;
    const { code, comment } = splitComment(line);
    const label = code.match(/^(take|main|emit):$/)?.[1];
    if (label) {
      section = label === "main" ? null : (label as "take" | "emit");
      continue;
    }
    if (section === "take" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(code)) {
      takes.push({ name: code, comment });
    }
    const emit =
      section === "emit"
        ? code.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?!=)|$)/)?.[1]
        : undefined;
    if (emit) emits.push(emit);
  }
  return { name, takes, emits };
};

/** Split on commas outside parentheses and brackets. */
const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

/**
 * Placeholder for an unconnected channel take, shaped after its comment:
 * `channel: [ val(meta), path(fasta) ]` -> `Channel.value([[:], []])`.
 * Mirrors emptyChannelFor in scripts/nfcoreSubworkflowParser.mjs.
 */
export const emptyChannelFor = (comment: string): string => {
  const shape = comment.match(/\[([\s\S]*)\]/)?.[1];
  if (!shape) return "Channel.value([])";
  const literal = splitTopLevel(shape).map((part) =>
    /\bmeta\d*\b/.test(part) ? "[:]" : "[]",
  );
  return `Channel.value([${literal.join(", ")}])`;
};

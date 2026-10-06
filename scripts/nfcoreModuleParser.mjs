// Parse nf-core module inputs (main.nf) and their metadata (meta.yml) into
// the input layout N-WAVE needs to call a module from a generated workflow.
// Used by generate-nfcore-catalog.mjs; tested in nfcoreModuleParser.test.mjs.

/**
 * @typedef {"each" | "first" | "collect"} ChannelMode
 *   How a path field's upstream channel is fed to the module:
 *   - each: one task per upstream item (per-sample data);
 *   - first: a single value reused by every task (references, indexes);
 *   - collect: all upstream items in one task (e.g. `path("quants/*")`).
 *
 * @typedef {{ kind: "meta", name: string }
 *   | { kind: "path", name: string, mode: ChannelMode, stageAs?: string }
 *   | { kind: "val", name: string }} InputItem
 *
 * @typedef {{
 *   argumentIndex: number,
 *   handle: string,
 *   tuple: boolean,
 *   metaName: string | null,
 *   fields: string[],
 *   items: InputItem[],
 *   unsupported: string[],
 * }} InputGroup
 *
 * @typedef {"boolean" | "integer" | "float" | "string" | "expression"} ValueType
 *
 * @typedef {{
 *   name: string,
 *   type: ValueType,
 *   description: string,
 *   defaultValue: string | number | boolean,
 * }} ValueInput
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The declarations in a process's `input:` block, one per line. */
export function getInputDeclarations(mainNf) {
  const inputBlock =
    mainNf.match(
      /^\s*input:\s*$([\s\S]*?)(?=^\s*(output|when|script|shell|exec|stub):\s*$)/m
    )?.[1] ?? "";
  return inputBlock
    .split(/\r?\n/)
    .map((line) => stripLineComment(line))
    .filter((line) => /^(tuple|path|val|env|stdin|file|each)\b/.test(line));
}

/** Split on commas that are not inside parentheses or quotes. */
export function splitTopLevel(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Drop a trailing `// comment`, ignoring `//` inside quoted strings. */
export function stripLineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length - 1; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "/" && value[index + 1] === "/") {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

const unquote = (value) => value.trim().replace(/^["']|["']$/g, "");

/**
 * Parse one qualifier: `path(x, stageAs: "a/*")`, `path x`, `path("dir/*")`,
 * `val(x)`, `val x`. Returns null for anything else (env, stdin, each, ...).
 */
export function parseQualifier(token) {
  const match = token.match(/^(path|val|file)\s*(?:\(([\s\S]*)\)|\s+([\s\S]+))$/);
  if (!match) return null;
  const kind = match[1] === "file" ? "path" : match[1];
  const [rawFirst = "", ...options] = splitTopLevel(match[2] ?? match[3] ?? "");
  // `path (indexes), stageAs: "dir*"`: parenthesised name, options outside.
  const first = rawFirst.replace(/^\(\s*([^()]*?)\s*\)$/, "$1");

  if (kind === "val") {
    return IDENTIFIER.test(first) ? { kind, name: first } : null;
  }

  const stageAs = options
    .map((option) => option.match(/^stageAs\s*:\s*(.+)$/)?.[1])
    .find(Boolean);

  if (IDENTIFIER.test(first)) {
    return { kind, name: first, ...(stageAs ? { stageAs: unquote(stageAs) } : {}) };
  }

  // Staging into a directory by pattern, e.g. path("quants/*").
  if (/^["'][^"']+["']$/.test(first)) {
    const pattern = unquote(first);
    const name = pattern
      .split("/")[0]
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return name ? { kind, name, stageAs: pattern, directory: true } : null;
  }

  return null;
}

/**
 * Parse every input declaration into a group (one per process argument).
 * Path field names are made unique across groups because they become ports.
 */
export function getInputGroups(declarations) {
  const usedNames = new Set();
  const uniqueName = (name) => {
    let candidate = name;
    for (let suffix = 2; usedNames.has(candidate); suffix += 1) {
      candidate = `${name}_${suffix}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  return declarations.map((declaration, index) => {
    const group = parseInputDeclaration(declaration, index);
    for (const item of group.items) {
      if (item.kind !== "meta") item.name = uniqueName(item.name);
    }
    group.fields = group.items
      .filter((item) => item.kind === "path")
      .map((item) => item.name);
    const firstPath = group.items.find((item) => item.kind === "path");
    group.handle = firstPath?.name ?? group.items.find((item) => item.kind === "val")?.name ?? `input_${index + 1}`;
    return group;
  });
}

function parseInputDeclaration(declaration, index) {
  const clean = stripLineComment(declaration);
  const isTuple = /^tuple\b/.test(clean);
  const tokens = isTuple
    ? splitTopLevel(clean.replace(/^tuple\s*/, ""))
    : [clean];
  const items = [];
  const unsupported = [];
  let metaName = null;

  tokens.forEach((token, tokenIndex) => {
    const qualifier = parseQualifier(token);
    if (!qualifier) {
      unsupported.push(
        isTuple
          ? `Unsupported tuple token: ${token}`
          : `Unsupported input declaration: ${declaration}`
      );
      return;
    }
    if (qualifier.kind === "val") {
      if (isTuple && tokenIndex === 0 && /^meta\d*$/.test(qualifier.name)) {
        metaName = qualifier.name;
        items.push({ kind: "meta", name: qualifier.name });
      } else {
        items.push({ kind: "val", name: qualifier.name });
      }
      return;
    }
    items.push({
      kind: "path",
      name: qualifier.name,
      mode: channelMode({ index, metaName, isTuple, qualifier }),
      ...(qualifier.stageAs ? { stageAs: qualifier.stageAs } : {}),
    });
  });

  return {
    argumentIndex: index,
    handle: "",
    tuple: isTuple,
    metaName,
    fields: [],
    items,
    unsupported,
  };
}

/**
 * Pick how a path field is fed. The first input carries the per-sample data;
 * later inputs are references (`meta2`/`meta3` tuples, plain paths) that every
 * task needs, so they become value channels. Directory staging such as
 * `path("quants/*")` gathers all upstream items into one task.
 */
function channelMode({ index, metaName, isTuple, qualifier }) {
  if (qualifier.directory) return "collect";
  if (index === 0) return "each";
  if (isTuple && metaName === "meta") return "each";
  return "first";
}

/**
 * Inputs described in meta.yml, keyed by name: { type, description }.
 * Handles the nested list layout nf-core uses:
 *
 *   input:
 *     - - meta:
 *           type: map
 *       - reads:
 *           type: file
 *     - star_ignore_sjdbgtf:
 *         type: boolean
 *         description: Ignore annotation GTF file
 */
export function getMetaInputs(metaYaml) {
  const lines = metaYaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "input:");
  if (start === -1) return {};

  /** @type {Record<string, { type: string, description: string }>} */
  const inputs = {};
  let current = null;
  let descriptionIndent = -1;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_]+:/.test(line)) break;

    const header = line.match(/^(\s*)(?:-\s+)+["']?([^"'\s:][^"':]*?)["']?:\s*$/);
    if (header) {
      current = { type: "", description: "" };
      inputs[header[2].trim()] = current;
      descriptionIndent = -1;
      continue;
    }
    if (!current) continue;

    if (descriptionIndent >= 0) {
      const indent = line.match(/^\s*/)[0].length;
      if (line.trim() === "" || indent > descriptionIndent) {
        if (line.trim()) {
          current.description = `${current.description} ${line.trim()}`.trim();
        }
        continue;
      }
      descriptionIndent = -1;
    }

    const field = line.match(/^(\s*)(type|description):\s*(.*)$/);
    if (!field) continue;
    const value = field[3].trim();
    if (field[2] === "type") {
      current.type = unquote(value);
    } else if (value === "|" || value === ">" || value === "|-" || value === ">-") {
      descriptionIndent = field[1].length;
    } else {
      current.description = unquote(value);
    }
  }

  return inputs;
}

/** Value inputs (plain `val` and `val` inside tuples) with typed defaults. */
export function getValueInputs(inputGroups, metaInputs) {
  return inputGroups.flatMap((group) =>
    group.items
      .filter((item) => item.kind === "val")
      .map((item) => {
        const meta = metaInputs[item.name] ?? { type: "", description: "" };
        const type = toValueType(meta.type);
        return {
          name: item.name,
          type,
          description: meta.description,
          defaultValue: defaultValueFor(type, meta.description),
        };
      })
  );
}

export function toValueType(metaType) {
  switch (metaType.toLowerCase()) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "float":
    case "number":
      return "float";
    case "string":
      return "string";
    default:
      // Lists, maps and untyped values are entered as Groovy expressions.
      return "expression";
  }
}

/** Default from the description ("(default= gene_id)"), else by type. */
export function defaultValueFor(type, description) {
  const documented = description.match(
    /\bdefault\s*[=:]\s*["'`]?([^"'`),\s]+)/i
  )?.[1];

  switch (type) {
    case "boolean":
      return documented ? documented.toLowerCase() === "true" : false;
    case "integer":
    case "float": {
      const number = Number(documented);
      return documented && Number.isFinite(number) ? number : 0;
    }
    case "string":
      return documented ?? "";
    default:
      return documented ?? "[]";
  }
}

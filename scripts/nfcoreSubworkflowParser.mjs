// Parse nf-core subworkflows (main.nf and meta.yml) into what N-WAVE needs
// to call one from a generated workflow: its `take` channels (node inputs
// and settings), its `emit` channels (node outputs) and the modules and
// subworkflows it includes. Used by generate-nfcore-catalog.mjs; tested in
// nfcoreSubworkflowParser.test.mjs.

import {
  defaultValueFor,
  splitTopLevel,
  stripLineComment,
  toValueType,
} from "./nfcoreModuleParser.mjs";

/**
 * @typedef {{
 *   name: string,
 *   kind: "channel" | "value",
 *   type: import("./nfcoreModuleParser.mjs").ValueType,
 *   description: string,
 *   defaultValue: string | number | boolean,
 * }} Take
 *   A channel take is a node input port; `defaultValue` is the Groovy
 *   expression passed while nothing is connected. A value take is a node
 *   setting, like a module's `val` input.
 *
 * @typedef {{ name: string, description: string }} Emit
 *
 * @typedef {{
 *   modules: string[],
 *   subworkflows: string[],
 *   plugins: string[],
 *   other: string[],
 * }} Includes
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Comment prefixes (`// val: ...`, `// bool: ...`) and meta.yml types that
// mark a take as a plain value rather than a channel.
const VALUE_WORDS = new Set([
  "val",
  "value",
  "bool",
  "boolean",
  "string",
  "integer",
  "int",
  "float",
  "number",
]);
const VALUE_META_TYPES = new Set([
  "boolean",
  "string",
  "integer",
  "float",
  "number",
]);

/** Split a line into code and its trailing `// comment`. */
function splitComment(line) {
  const code = stripLineComment(line);
  const rest = line.trim().slice(code.length).trim();
  return {
    code,
    comment: rest.startsWith("//") ? rest.replace(/^\/\/+\s*/, "") : "",
  };
}

/**
 * The workflow declared in a subworkflow's main.nf: its name and the lines
 * of its `take:` and `emit:` sections, with their comments.
 */
export function getWorkflowSections(mainNf) {
  const lines = mainNf.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^\s*workflow\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line)
  );
  if (start === -1) return { name: "", take: [], emit: [] };

  const name = lines[start].match(/workflow\s+([A-Za-z_][A-Za-z0-9_]*)/)[1];
  const sections = { take: [], emit: [] };
  let section = null;
  for (const line of lines.slice(start + 1)) {
    // The workflow ends at the first closing brace in column 0.
    if (/^\}/.test(line)) break;
    const { code, comment } = splitComment(line);
    const label = code.match(/^(take|main|emit):$/)?.[1];
    if (label) {
      section = label === "main" ? null : label;
      continue;
    }
    if (section && code) sections[section].push({ code, comment });
  }
  return { name, take: sections.take, emit: sections.emit };
}

/**
 * Placeholder for an unconnected channel take, shaped after the take's
 * comment: `channel: [ val(meta), path(fasta) ]` -> `Channel.value([[:], []])`.
 * nf-core modules read `[]` as "no file", so optional inputs stay empty.
 */
export function emptyChannelFor(comment) {
  const shape = comment.match(/\[([\s\S]*)\]/)?.[1];
  if (!shape) return "Channel.value([])";
  const parts = splitTopLevel(
    // Nested lists ([ reads ]) count as one element.
    shape.replace(/\[[^[\]]*\]/g, "[]")
  );
  const literal = parts.map((part) => (/\bmeta\d*\b/.test(part) ? "[:]" : "[]"));
  return `Channel.value([${literal.join(", ")}])`;
}

/** The takes of a subworkflow, typed with the help of its meta.yml. */
export function getTakes(sections, metaInputs) {
  return sections.take
    .filter(({ code }) => IDENTIFIER.test(code))
    .map(({ code: name, comment }) => {
      const meta = metaInputs[name] ?? { type: "", description: "" };
      const word = comment.match(/^([A-Za-z]+)/)?.[1]?.toLowerCase() ?? "";
      const isValue =
        VALUE_WORDS.has(word) ||
        (!comment.toLowerCase().startsWith("channel") &&
          VALUE_META_TYPES.has(meta.type.toLowerCase()));
      const description = meta.description || comment;

      if (!isValue) {
        return {
          name,
          kind: "channel",
          type: "expression",
          description,
          defaultValue: emptyChannelFor(comment),
        };
      }
      const type = toValueType(
        meta.type || (word === "bool" ? "boolean" : word === "int" ? "integer" : word)
      );
      return {
        name,
        kind: "value",
        type,
        description,
        defaultValue: defaultValueFor(type, meta.description),
      };
    });
}

/** The emits of a subworkflow: `name = expression` or a bare `name`. */
export function getEmits(sections) {
  return sections.emit.flatMap(({ code, comment }) => {
    const name = code.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?!=)|$)/)?.[1];
    return name ? [{ name, description: comment }] : [];
  });
}

/**
 * What a subworkflow includes, by kind: nf-core modules ("salmon/quant"),
 * other nf-core subworkflows ("bam_sort_stats_samtools"), plugins and
 * anything else (local files N-WAVE can't install).
 */
export function getIncludes(mainNf) {
  /** @type {Includes} */
  const includes = { modules: [], subworkflows: [], plugins: [], other: [] };
  const add = (list, value) => {
    if (!list.includes(value)) list.push(value);
  };
  for (const match of mainNf.matchAll(
    /^\s*include\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm
  )) {
    const target = match[1];
    const module = target.match(
      /^(?:\.\.\/)+modules\/nf-core\/([a-z0-9_/-]+?)(?:\/main(?:\.nf)?)?$/
    );
    const subworkflow = target.match(
      /^\.\.\/(?:\.\.\/nf-core\/)?([a-z0-9_]+)(?:\/main(?:\.nf)?)?$/
    );
    if (target.startsWith("plugin/")) add(includes.plugins, target);
    else if (module) add(includes.modules, module[1]);
    else if (subworkflow) add(includes.subworkflows, subworkflow[1]);
    else add(includes.other, target);
  }
  for (const list of Object.values(includes)) list.sort();
  return includes;
}

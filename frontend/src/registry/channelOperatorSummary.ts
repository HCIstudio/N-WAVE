import { closingBracket, maskSource } from "../workflows/import/nextflowSource";

/** What a channel operator's code does, in a few words: its node's label and subtitle. */
export interface ChannelOperatorSummary {
  /** The operators it applies: `filter`, `map → collect`, `channel.fromPath`. */
  label: string;
  /** What the first of them is given: a closure's body or the arguments. */
  subtitle: string;
}

/** Calls that only name the result; they say nothing about what the code does. */
const NAMING = new Set(["set"]);
const MAX_OPERATORS = 3;
const MAX_SUBTITLE = 48;

const shorten = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_SUBTITLE ? `${flat.slice(0, MAX_SUBTITLE - 1).trimEnd()}…` : flat;
};

/** A closure's body, without its parameters (`meta, files -> meta.id == 1` gives `meta.id == 1`). */
const closureBody = (inside: string): string => {
  const masked = maskSource(inside);
  const arrow = masked.indexOf("->");
  // Only an arrow before any nested closure or call belongs to this closure's parameters.
  const nested = masked.search(/[{(]/);
  return arrow >= 0 && (nested < 0 || arrow < nested) ? inside.slice(arrow + 2) : inside;
};

/**
 * The operators a channel operator's code applies, outside closures and calls
 * (`input.reads.filter { … }.map { … }`), as a label and a subtitle. Null for
 * code that applies none (a plain assignment, an `if`).
 */
export const summarizeChannelCode = (code: string): ChannelOperatorSummary | null => {
  const masked = maskSource(code);
  const names: string[] = [];
  let subtitle = "";
  let depth = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if ("{([".includes(char)) depth += 1;
    else if ("})]".includes(char)) depth -= 1;
    if (depth !== 0 || char !== ".") continue;
    const match = /^\.\s*([A-Za-z_]\w*)\s*([({])/.exec(masked.slice(index));
    if (!match) continue;
    const name = match[1];
    const open = index + match[0].length - 1;
    const close = closingBracket(masked, open);
    if (close < 0) break;
    if (!NAMING.has(name)) {
      // `channel.of(…)`: the factory, with what it's called on.
      const receiver = /([A-Za-z_]\w*)\s*$/.exec(masked.slice(0, index))?.[1];
      const factory = receiver && /^[Cc]hannel$/.test(receiver);
      names.push(factory ? `channel.${name}` : name);
      if (names.length === 1) {
        const inside = code.slice(open + 1, close);
        subtitle = shorten(match[2] === "{" ? closureBody(inside) : inside);
        // `.map(…) { … }`: the closure after the arguments says more.
        const trailing = /^\s*\{/.exec(masked.slice(close + 1));
        if (match[2] === "(" && trailing) {
          const closureOpen = close + 1 + trailing[0].length - 1;
          const closureClose = closingBracket(masked, closureOpen);
          if (closureClose > 0) subtitle = shorten(closureBody(code.slice(closureOpen + 1, closureClose)));
        }
      }
    }
    index = close;
  }
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_OPERATORS).join(" → ");
  return { label: names.length > MAX_OPERATORS ? `${shown} → …` : shown, subtitle };
};

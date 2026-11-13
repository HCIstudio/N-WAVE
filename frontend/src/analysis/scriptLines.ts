// Which canvas node wrote each line of a generated script, so what a tool
// finds at a line (nextflow lint: `main.nf:12:5`) shows on that node.
//
// The generator names every node in the script (generateNextflowScriptWithNames):
// a step by its process or call name, an input or channel operator by the
// channel it defines. A line belongs to
//   - a process or workflow definition: the node of that name;
//   - an include: the node of the (first) name it includes as;
//   - a statement of the entry workflow: the step it calls first in its
//     first line (`ALIGN(…)`, `x = ALIGN(…)`); else, for glue a step reads
//     (`ch_x = A.out.y.map { … }`), the step that reads it; else the node
//     whose channel it defines (a channel operator's block, an input's
//     channel); else the node of the statement right before it (a channel
//     operator's block goes on without a blank line).
//   - a branch's `if (…) { … } else { … }` (N-WAVE writes it from a Branch
//     node): each call in it, its step; the rest (the if and else lines,
//     the channels its arms set, and their `channel.empty()` before it), the
//     Branch node;
//   - code kept as written at its place (a code node: functions, the output
//     block, publish:): that node, found by its code.
// Other lines (params, the header, comments, helper functions) belong to no node.

import type { Node } from "@xyflow/react";
import { placementOf } from "../generators/core/placement";
import {
  blockBody,
  definedNames,
  maskSource,
  readConditionalChain,
  readIncludeItem,
  splitWorkflowStatements,
  topLevelItems,
} from "../workflows/import/nextflowSource";

/** Line number (1-based) → node id, for the lines a node wrote. */
export type LineOwners = Map<number, string>;

const lineOf = (text: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1)
    if (text[index] === "\n") line += 1;
  return line;
};

export const lineOwners = (
  script: string,
  names: Map<string, string>,
  nodes: Node[] = [],
): LineOwners => {
  const byName = new Map<string, string>();
  for (const [nodeId, name] of names)
    if (!byName.has(name)) byName.set(name, nodeId);
  const owners: LineOwners = new Map();
  const own = (start: number, end: number, nodeId: string | undefined) => {
    if (!nodeId) return;
    const first = lineOf(script, start);
    const last = lineOf(script, Math.max(start, end - 1));
    for (let line = first; line <= last; line += 1)
      if (!owners.has(line)) owners.set(line, nodeId);
  };

  // Code nodes first: their code is written as it is.
  const lines = script.split("\n");
  for (const node of nodes) {
    if (!placementOf(node.data as Record<string, unknown>)) continue;
    const code = String(
      (node.data as { channelOperatorCode?: unknown }).channelOperatorCode ??
        "",
    ).trim();
    for (const line of code ? code.split("\n") : []) {
      // Placed code may be indented (publish:), so each of its lines is found on its own.
      if (!line.trim()) continue;
      const index = lines.findIndex(
        (candidate, at) =>
          !owners.has(at + 1) && candidate.trim() === line.trim(),
      );
      if (index !== -1) owners.set(index + 1, node.id);
    }
  }

  for (const item of topLevelItems(script)) {
    if ((item.kind === "process" || item.kind === "workflow") && item.name && byName.has(item.name)) {
      own(item.start, item.end, byName.get(item.name));
    } else if (item.kind === "workflow" && item.name) {
      // A group (#221): its statements are its steps', as in the entry workflow.
      ownEntryWorkflow(script, item.start, item.text, byName, own);
    } else if (item.kind === "include") {
      const first = readIncludeItem(item.text)[0];
      own(item.start, item.end, first && byName.get(first.alias));
    } else if (item.kind === "workflow" && !item.name) {
      ownEntryWorkflow(script, item.start, item.text, byName, own);
    }
  }
  return owners;
};

const ownEntryWorkflow = (
  script: string,
  start: number,
  text: string,
  byName: Map<string, string>,
  own: (start: number, end: number, nodeId: string | undefined) => void,
) => {
  const body = blockBody(text);
  // Branches are named `branch_1`, … in the order their blocks come (nested ones inside theirs).
  let branchCount = 0;
  ownStatements(script, body, start + text.indexOf(body), byName, own, () => {
    branchCount += 1;
    return byName.get(`branch_${branchCount}`);
  });
};

const EMPTY_START = /^\s*[A-Za-z_]\w*\s*=\s*channel\.empty\(\)\s*$/;

/** Whether a block is a branch N-WAVE wrote: an if (or switch) that calls a step, at any depth, and loops nowhere. */
const isBranchBlock = (text: string, byName: Map<string, string>): boolean => {
  if (!readConditionalChain(text.trim())) return false;
  const masked = maskSource(text);
  if (/(?:^|[\s;{])(?:for|while)\s*\(/.test(masked)) return false;
  return [...masked.matchAll(/(?<![.\w])([A-Z][A-Z0-9_]*)\s*\(/g)].some((match) => byName.has(match[1]));
};

/** The statements of a workflow, or of a branch's arm, in order: each its node's. */
const ownStatements = (
  script: string,
  body: string,
  from: number,
  byName: Map<string, string>,
  own: (start: number, end: number, nodeId: string | undefined) => void,
  nextBranch: () => string | undefined,
) => {
  let cursor = from;
  const statements = splitWorkflowStatements(body).flatMap((statement) => {
    const at = script.indexOf(statement.text, cursor);
    if (at === -1) return [];
    cursor = at + statement.text.length;
    return [{ ...statement, at, called: calledStep(statement.text, byName) }];
  });
  const branchAt = new Map<number, true>();
  statements.forEach((statement, index) => {
    if (isBranchBlock(statement.text, byName)) branchAt.set(index, true);
  });
  let previous: string | undefined;
  statements.forEach((statement, index) => {
    if (branchAt.has(index)) {
      // Its arms' statements are their nodes'; the rest of the block (if, else, the channels it sets) the branch's.
      const branch = nextBranch();
      const chain = readConditionalChain(statement.text.trim());
      let inner = statement.at;
      for (const arm of [...(chain?.bodies ?? []), chain?.elseBody ?? ""]) {
        if (!arm.trim()) continue;
        const at = script.indexOf(arm, inner);
        if (at === -1) continue;
        ownStatements(script, arm, at, byName, own, nextBranch);
        inner = at + arm.length;
      }
      own(statement.at, statement.at + statement.text.length, branch);
      // The channels it sets start empty right before it (`ch_bam = channel.empty()`).
      for (let back = index - 1; back >= 0 && EMPTY_START.test(statements[back].text); back -= 1) {
        own(statements[back].at, statements[back].at + statements[back].text.length, branch);
      }
      previous = branch;
      return;
    }
    // A channel a branch sets starts empty right before it: owned with the branch.
    if (EMPTY_START.test(statement.text) && statements.slice(index + 1).find((later) => !EMPTY_START.test(later.text)) === statements.find((_, at) => at > index && branchAt.has(at))) {
      previous = undefined;
      return;
    }
    // Glue (`ch_x = A.out.y.map { … }`) is the step that reads it next.
    const defined = definedNames(statement.text);
    // Only an assignment is glue, not a block (`if (…) { ch_x = … }`).
    const isAssignment = /^\s*[A-Za-z_]\w*\s*=(?!=)/.test(statement.text);
    const consumer = statement.called || !isAssignment
      ? undefined
      : statements
          .slice(index + 1)
          .find((later) => later.called && defined.some((name) => new RegExp(`(?<![.\\w])${name}(?!\\w)`).test(later.text)))?.called;
    const definesOwnChannel = defined.map((name) => byName.get(name)).find(Boolean);
    const owner =
      statement.called ??
      definesOwnChannel ??
      consumer ??
      ownerOf(statement.text, byName) ??
      // A channel operator's code is one block: its later statements follow
      // without a blank line and belong to it too.
      (statement.blankBefore ? undefined : previous);
    own(statement.at, statement.at + statement.text.length, owner);
    previous = owner;
  });

};

/** The step a statement's first line calls (`ALIGN(…)`, `x = ALIGN(…)`). */
const calledStep = (statement: string, byName: Map<string, string>): string | undefined => {
  const firstLine = maskSource(statement).split("\n")[0] ?? "";
  const call = firstLine.match(/^\s*(?:[A-Za-z_]\w*\s*=\s*)?([A-Za-z_]\w*)\s*\(/);
  return call ? byName.get(call[1]) : undefined;
};

/** The node a workflow statement is: the step its first line calls, else the channel it defines. */
const ownerOf = (
  statement: string,
  byName: Map<string, string>,
): string | undefined => {
  const firstLine = maskSource(statement).split("\n")[0] ?? "";
  const call = firstLine.match(
    /^\s*(?:[A-Za-z_]\w*\s*=\s*)?([A-Za-z_]\w*)\s*\(/,
  );
  if (call && byName.has(call[1])) return byName.get(call[1]);
  for (const name of definedNames(statement)) {
    const nodeId = byName.get(name);
    if (nodeId) return nodeId;
  }
  // `ch | STEP`, `STEP.out.x.view()`: the first step it names.
  for (const match of firstLine.matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)) {
    const nodeId = byName.get(match[1]);
    if (nodeId) return nodeId;
  }
  return undefined;
};

// N-WAVE's JSON for a BioFlow-Insight analysis (backend/bioflow/README.md).
// Every result the analysis image writes is checked against this schema;
// N-WAVE relies on nothing else BioFlow-Insight produces.

import { z } from "zod";

export const BIOFLOW_SCHEMA = "n-wave-bioflow/1";

const stepSchema = z.object({
  /** The calls' names from the top, joined by dots: `GENOME.INDEX`. */
  id: z.string().min(1),
  /** The name the process is called by. */
  name: z.string(),
  /** The process's own name. */
  process: z.string(),
  /** Its file, from the project folder. */
  file: z.string().nullable(),
  /** The subworkflow call it's in (an id in `subworkflows`), or null. */
  subworkflow: z.string().nullable(),
  code: z.string(),
  conditions: z.array(z.string()),
});

const groupSchema = z.object({
  steps: z.array(z.string()),
  /** Index of the group it's in, in the same list. */
  parent: z.number().int().nonnegative().nullable(),
});

export const bioflowResultSchema = z.object({
  schema: z.literal(BIOFLOW_SCHEMA),
  tool: z.object({
    name: z.string(),
    version: z.string(),
    /** "nls": Nextflow's parser; "bioflow": BioFlow-Insight's own. */
    engine: z.enum(["nls", "bioflow"]).nullable(),
  }),
  dsl: z.string().nullable(),
  error: z
    .object({ code: z.string(), message: z.string(), file: z.string().nullable() })
    .nullable(),
  notes: z.array(z.string()),
  steps: z.array(stepSchema),
  connections: z.array(z.object({ from: z.string(), to: z.string() })),
  subworkflows: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      workflow: z.string(),
      file: z.string().nullable(),
      parent: z.string().nullable(),
    })
  ),
  conditions: z.array(z.object({ condition: z.string(), steps: z.array(z.string()) })),
  groups: z.object({
    condition: z.array(groupSchema).nullable(),
    dominator: z.array(groupSchema).nullable(),
    parallel: z.array(groupSchema).nullable(),
  }),
  metrics: z.record(z.number()),
});

export type BioflowResult = z.infer<typeof bioflowResultSchema>;

/**
 * A result whose references hold: connections, conditions and groups name
 * steps that exist, and subworkflows' parents exist. Returns the problems.
 */
export const checkReferences = (result: BioflowResult): string[] => {
  const steps = new Set(result.steps.map((step) => step.id));
  const subworkflows = new Set(result.subworkflows.map((sub) => sub.id));
  const problems: string[] = [];
  const step = (id: string, where: string) => {
    if (!steps.has(id)) problems.push(`${where} names an unknown step ${id}`);
  };
  for (const entry of result.steps) {
    if (entry.subworkflow && !subworkflows.has(entry.subworkflow)) {
      problems.push(`step ${entry.id} is in an unknown subworkflow ${entry.subworkflow}`);
    }
  }
  for (const sub of result.subworkflows) {
    if (sub.parent && !subworkflows.has(sub.parent)) {
      problems.push(`subworkflow ${sub.id} is in an unknown subworkflow ${sub.parent}`);
    }
  }
  for (const connection of result.connections) {
    step(connection.from, "a connection");
    step(connection.to, "a connection");
  }
  for (const condition of result.conditions) {
    for (const id of condition.steps) step(id, `condition ${condition.condition}`);
  }
  for (const [kind, groups] of Object.entries(result.groups)) {
    for (const [index, group] of (groups ?? []).entries()) {
      for (const id of group.steps) step(id, `a ${kind} group`);
      if (group.parent !== null && group.parent >= index) {
        problems.push(`a ${kind} group's parent comes after it`);
      }
    }
  }
  return problems;
};

/** The analysis image's output, read and checked; throws on anything else. */
export const parseBioflowResult = (stdout: string): BioflowResult => {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error("The analysis did not return JSON.");
  }
  const parsed = bioflowResultSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `The analysis returned a result N-WAVE doesn't know (${issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid"}).`
    );
  }
  const problems = checkReferences(parsed.data);
  if (problems.length > 0) {
    throw new Error(`The analysis returned an inconsistent result: ${problems[0]}.`);
  }
  return parsed.data;
};

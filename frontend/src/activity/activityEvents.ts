// Verbose mode's events (the activity log): their shape, the types N-WAVE
// records, and reading them back by time or marked test. Shared by the
// recorder, the browser demo's store and the export.

/** Every type of event, and what its `data` holds. */
export const ACTIVITY_TYPES = {
  /** Recording began in this tab: `features` in effect, `recordsValues`. */
  "session.started": "Recording began in a tab, with the feature switches in effect",
  /** `features` after a change in Global Settings. */
  "features.changed": "The feature switches changed",
  /** `element` (button, link, tab, menuitem, option), `name`. */
  "ui.click": "A button, link, tab or menu entry was clicked",
  /** `nodes`, `edges`: counts. */
  "workflow.opened": "A workflow was opened",
  /** `nodeId`, `nodeType`, `label`. */
  "node.added": "A node was added",
  "node.removed": "A node was removed",
  /** `nodeIds`. */
  "node.moved": "Nodes were moved",
  /** `nodeId`, `nodeType`, `keys`: the settings changed (`values` with NWAVE_VERBOSE_VALUES). */
  "node.configured": "A node's settings changed",
  /** `edgeId`, `source`, `sourceHandle`, `target`, `targetHandle`, `hint` when the ports don't fit. */
  "connection.made": "A connection was made",
  "connection.removed": "A connection was removed",
  /** The same, without `edgeId`, and the `reason` shown. */
  "connection.rejected": "A connection was refused",
  /** `problems`: `{ id, level }` each; `mode`. */
  "check.result": "The workflow check's result changed",
  /** `resume`, `snapshot` (the workflow's nodes and connections). */
  "run.started": "A run started",
  /** `runId`, `outcome` (succeeded, failed, cancelled), `durationMs`, `reason`. */
  "run.ended": "A run ended",
  /** `runId`, `steps` (`name`, `status`, `durationMs`), `files` (result paths). */
  "run.results": "A finished run's step times and result files",
  /** `runId`, `kind`, `title`. */
  "failure.explained": "A failure explanation was shown",
  /** `kind`, `certainty`, `helpful` (true or false). */
  "failure.feedback": "Did this help? was answered for a failure explanation",
  "help.opened": "The Help page was opened",
  /** `term`. */
  "glossary.opened": "A glossary explanation was opened",
  /** `nodeId`. */
  "code.opened": "A node's Code tab was opened",
  /** `nodeId` (a canvas node) or `step` (a step inside), `depth`. */
  "nested.opened": "The steps inside a subworkflow or pipeline were opened",
  undo: "Undo",
  redo: "Redo",
  /** `format` (nextflow, json). */
  "workflow.imported": "A workflow was imported",
  /** `subworkflow`, `workflowId`, `nodes`. */
  "workflow.copiedSubworkflow": "An nf-core subworkflow was copied into a new workflow",
  /** `kind` (script, project). */
  "workflow.exported": "A workflow was exported",
  /** `label`. */
  "test.started": "A marked test started",
  "test.ended": "A marked test ended",
} as const;

export type ActivityType = keyof typeof ACTIVITY_TYPES;

export interface ActivityEvent {
  id: string;
  /** ISO 8601. */
  time: string;
  type: ActivityType;
  /** The browser tab (a random id per tab). */
  session?: string;
  /** The pseudonymous ID set in Global Settings, e.g. a participant code. */
  participant?: string;
  /** The marked test the event happened in. */
  test?: string;
  workflowId?: string;
  /** The page, e.g. /workflow/abc. */
  path?: string;
  data?: Record<string, unknown>;
}

export interface ActivityFilter {
  /** ISO times; `to` is exclusive. */
  from?: string;
  to?: string;
  test?: string;
}

export const filterActivity = (events: ActivityEvent[], filter: ActivityFilter = {}): ActivityEvent[] => {
  const from = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY;
  const to = filter.to ? Date.parse(filter.to) : Number.POSITIVE_INFINITY;
  return events.filter((event) => {
    const time = Date.parse(event.time);
    return time >= from && time < to && (!filter.test || event.test === filter.test);
  });
};

export interface MarkedTest {
  id: string;
  label?: string;
  startedAt: string;
  endedAt?: string;
}

/** The marked tests in the events, newest first. */
export const markedTests = (events: ActivityEvent[]): MarkedTest[] => {
  const tests = new Map<string, MarkedTest>();
  for (const event of events) {
    if (!event.test) continue;
    const test = tests.get(event.test) ?? { id: event.test, startedAt: event.time };
    if (event.type === "test.started" && typeof event.data?.label === "string" && event.data.label) {
      test.label = event.data.label;
    }
    if (event.type === "test.ended") test.endedAt = event.time;
    tests.set(event.test, test);
  }
  return [...tests.values()].reverse();
};

export interface ActivitySummary {
  events: number;
  bytes: number;
  oldest?: string;
  newest?: string;
  tests: MarkedTest[];
  /** Whether N-WAVE keeps events now (verbose mode on). */
  recording: boolean;
  /** Parameter values and file contents are recorded (NWAVE_VERBOSE_VALUES). */
  recordsValues: boolean;
  activityLog: { retentionDays: number | null };
}

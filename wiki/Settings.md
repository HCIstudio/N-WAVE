The **Global Settings** button on the home page, next to **Import Workflow**, opens the
settings for all of N-WAVE. In its
[execution settings](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows#execution-settings),
a workflow can choose another run profile and lower limits of its own, but never higher limits
than the global ones.

## Notifications

N-WAVE can send browser notifications while you're in another tab or window:

- a run **finished** (with how long it took),
- a run **failed or was stopped** (with the reason, as the run panel explains it),
- N-WAVE **can't be reached** any more, and again when it's **back**.

Turn on **Send browser notifications**; the browser asks for permission then (not before).
Choose which events to be told about, and use **Send test notification** to check that they
show up. If nothing shows up, check your system's notification settings (Focus, Do Not
Disturb). Clicking a run's notification opens its workflow with the run panel.

Notifications only come while the N-WAVE tab isn't in view; when it is, the page shows the
same itself. With several N-WAVE tabs open, each event is notified once. The choices are kept
in this browser.

Browsers allow notifications only for pages on HTTPS or on this computer (`localhost`). When
N-WAVE is opened over plain HTTP from another machine, the page says so; open it at
`http://localhost` or put it behind HTTPS. If the browser blocks N-WAVE's notifications,
allow them in the site settings (the icon left of the address) and reload the page.

## Run limits

**Maximum CPU Cores**, **Maximum Memory** and **Execution Timeout**: the most any run may use.
Workflows use these unless they set lower ones (*Execution Settings → Resources*, with
**Use the global limits** turned off). A workflow's limits above these are lowered to them, and
its settings say so. The page shows what the server allows: higher values are lowered to
`NWAVE_MAX_CPUS` and `NWAVE_MAX_MEMORY`, and a timeout of 0 uses `NWAVE_EXECUTION_TIMEOUT`
(24 hours unless set). Each step may run as long as the run.

## Resume

When **Resume** starts out on by the Run button: after a failed or stopped run (the default),
whenever earlier runs left a cache, or never. The switch can always be changed before a run.

## Run profiles

The [run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles) and the one runs use
(**Runs use by default**). Workflows follow it, also when it changes later, unless
*Execution Settings → Profiles → Use the global run profile* is turned off and they choose
another profile or this computer. Workflows from before Global Settings keep running on this
computer until you choose otherwise.

Click **Save global settings** to apply changes. The run limits, Resume, profiles and
[feature switches](#features) are kept by N-WAVE (in `settings.json` in its data folder), so
every browser uses the same.

## Run cache

How much space the run cache of all workflows takes, and **Clear all caches**. Folders of runs
that are still going are left alone. Results, inputs and logs stay. A single workflow's cache
is in its execution settings.

## Features

Switch N-WAVE's features on and off, for example to keep a course or a lab's installation
simple, or to compare how people work with and without a feature. **Off hides a feature; it
doesn't break anything:** workflows that use it still open and run. The switches apply to
everyone using this N-WAVE and are saved as soon as you change one (no **Save** needed).

| Switch | Name for `NWAVE_FEATURES` | Off |
| --- | --- | --- |
| Workflow check before running | `workflowCheck` | `block` (the default): problems keep Run disabled. `warn`: they're shown, but the workflow can run. `off`: no check (Nextflow reports the problems when the run fails). |
| Connection hints | `connectionHints` | Inputs don't light up while dragging a connection, and connections that don't fit get no warning. |
| Minimap | `minimap` | No minimap of the whole workflow at the bottom left of the canvas. |
| Failure explanations | `failureExplanations` | A failed run shows its log, without an explanation in plain language. |
| Glossary and Help | `glossary` | No ⓘ term explanations, and no Help button or page. |
| Templates and built-in examples | `templates` | **New Workflow** starts an empty workflow, and the built-in demos and the tutorial are hidden. Their links still open. |
| Custom code | `customCode` | No custom processes, **Code** tab or converting nodes to custom ones. Workflows with custom code still run. |
| Node packs | `nodePacks` | Node packs can't be added, exported or managed. Nodes from installed packs still work. |
| Resume | `resume` | Every run starts from scratch; the Resume switch and the run cache settings are hidden. |
| Run profiles | `runProfiles` | Runs use this computer; run profiles can't be chosen or edited. |
| Notifications | `notifications` | No browser notifications, and their settings are hidden. |
| Run performance and reports | `performance` | No **Performance** tab, execution report or timeline after a run. |

[Verbose mode](#verbose-mode) is switched the same way (`verbose`, off by default) and can be
fixed by the installation too.

Every run records which features were on when it started (in the run history, `runs.json` in
N-WAVE's data folder), so runs can be compared later.

### Fixing switches for an installation

Whoever runs N-WAVE can fix switches when it starts, so they can't be changed in the app. A
fixed switch shows **Fixed by this installation** and can't be clicked. Set either or both:

- `NWAVE_FEATURES`: a comma-separated list, e.g.
  `NWAVE_FEATURES="connectionHints=off,workflowCheck=warn"`. On/off switches take `on` or `off`
  (also `true`/`false`, `yes`/`no`, `1`/`0`); `workflowCheck` takes `block`, `warn` or `off`.
- `NWAVE_FEATURES_FILE`: the path of a JSON file, e.g.
  `{"connectionHints": false, "workflowCheck": "warn"}`.

Where both name the same switch, `NWAVE_FEATURES` wins. Names or values N-WAVE doesn't know are
skipped, with a warning in the backend's log. Switches that neither sets can still be changed
in the app.

## Verbose mode

Verbose mode records what happens in N-WAVE, to debug problems people report and for short
usability tests. It is **off** by default. Turn it on under **Verbose mode → Record what
happens**, or fix it for an installation with `NWAVE_FEATURES="verbose=on"` (see
[above](#fixing-switches-for-an-installation)). While it records, a marker at the top of every
page says **Recording**.

### What is recorded

One event per line (JSON), each with an `id`, its `time` (ISO 8601), its `type`, the browser
tab's `session`, the `participant` ID and marked `test` if set, the open `workflowId`, the page
(`path`) and the event's `data`:

| Type | When | `data` |
| --- | --- | --- |
| `session.started` | Recording begins in a browser tab | `features`: the switches in effect; `recordsValues` |
| `features.changed` | A feature switch changed | `features` |
| `ui.click` | A button, link, tab or menu entry was clicked | `element`, `name` (its label) |
| `workflow.opened` | A workflow was opened | `nodes`, `edges` (counts) |
| `node.added`, `node.removed` | A node was added or removed (also by paste, undo or a template) | `nodeId`, `nodeType`, `label` |
| `node.moved` | Nodes were moved (once the drag ends) | `nodeIds` |
| `node.configured` | A node's settings changed (once typing pauses) | `nodeId`, `nodeType`, `label`, `keys`: the settings changed |
| `connection.made`, `connection.removed` | A connection was made or removed | `edgeId`, `source`, `sourceHandle`, `target`, `targetHandle`; `hint` when the ports don't fit |
| `connection.rejected` | A connection was dropped on an input that refused it | the same, and the `reason` shown |
| `check.result` | The workflow check's result changed | `mode`, `problems` (`id`, `level`) |
| `run.started` | A run started | `resume`, and the workflow's nodes and connections (a snapshot) |
| `run.ended` | A run finished, failed or was stopped | `runId`, `outcome`, `durationMs`, `reason` |
| `run.results` | A finished run's results were read | `runId`, `steps` (`name`, `status`, `durationMs`), `files` (result paths) |
| `failure.explained` | A failure explanation was shown | `kind`, `title`, `certainty`, `process` |
| `failure.feedback` | *Did this help?* was answered under a failure explanation | `kind`, `certainty`, `helpful` (`true` or `false`) |
| `nested.opened` | The steps inside a subworkflow or pipeline node were opened | `nodeId` (from the canvas) or `step` (from inside), `depth` |
| `help.opened`, `glossary.opened`, `code.opened` | Help, a glossary explanation (`term`) or a node's Code tab (`nodeId`) was opened | |
| `undo`, `redo` | Undo or redo | |
| `workflow.imported`, `workflow.exported` | A workflow was imported (`format`) or exported (`kind`: script or project) | |
| `test.started`, `test.ended` | A marked test began or ended | `label` |

**Not recorded:** names, what is typed into fields, file contents and parameter values. An
installation can record parameter values and file contents too with
`NWAVE_VERBOSE_VALUES=on` (for debugging; the Settings page says when it does); then
`node.configured` has the new `values` and the run snapshots have each node's settings.

### Participant ID and marked tests

**Participant ID** sets a pseudonymous code for this browser, e.g. `P07` (letters, digits, `-`
and `_` only, never a name); every event from the browser carries it. For a short test with a
participant, click **Start test** in the marker at the top (with an optional label) and **End
test** when done: the events in between carry the test's id and can be exported on their own.

### Export, bug reports and clearing

- **Download ZIP** exports everything, the events between two dates, or one marked test:
  `events.jsonl` (the events), `events.csv` (the same as a table, with `data` as JSON),
  `snapshots/` (the workflow at each run; `run.started` names its file) and a README.
- **Copy for bug report** copies the last 10 minutes as text to paste into a
  [GitHub issue](https://github.com/HCIstudio/N-WAVE/issues).
- **Keep events for** drops older events after 7, 30 or 90 days or a year; **Clear log…**
  deletes them all.

The events are kept by N-WAVE in `activity.jsonl` in its data folder, for the whole
installation; in the browser demo, in this browser's local storage. While verbose mode is off,
nothing is kept.

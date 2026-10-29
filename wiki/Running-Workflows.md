Runs need an [installation](https://github.com/HCIstudio/N-WAVE/wiki/Installation); the
browser demo can't run workflows. Click **Run Workflow** (the green ▶ in the bottom bar) or
press Ctrl+Enter. If the [workflow check](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows#the-workflow-check)
finds a problem, Run is disabled and its tooltip says why.

## The run panel

The panel opens with the run. Minimized, it is the **Runs** bar at the bottom right of the
canvas, always there: click it for the run's steps and log, or the workflow's earlier runs. If
you leave the page while a run goes, the run goes on; opening the workflow again shows it,
live. If the connection drops (or N-WAVE restarts), the panel waits for N-WAVE and then shows
how the run ended, instead of starting it again.

- **Steps**: how many of the run's steps (Nextflow processes) have finished, the progress of
  each step by its name on the canvas, and the run's key results (such as the MultiQC report)
  when it ends. A whole pipeline or a subworkflow lists its own steps under it. The bar counts
  finished steps, not time: steps differ a lot in how long they take, and until Nextflow says
  how many steps there are, the bar only shows that the run is going.
- **Performance**: once the run has ended (also when it failed), **Execution report** and
  **Timeline** open Nextflow's own reports in a new tab. Below them: how long the run took, its
  CPU hours, and how many tasks were cached, retried or failed. A table lists the steps, slowest
  first, with their total and longest task time and their peak memory next to the memory they
  had, plus a bar for when each ran. A step that used 90% or more of its memory gets a hint: it
  is the first to fail with exit status 137 (out of memory).
- **Log**: the full output as it arrives, with a **Copy** button.
- **History**: the workflow's earlier runs, each with its outcome, log, results, its report
  buttons and the same time and memory per step.

On the canvas, each node shows **Running**, **Results ready**, **Failed** or **Reused from
cache**. Double-click a node and open **Results** to see the files its tasks produced, with a
preview of text files. **Cancel run** stops Nextflow and its tasks.

While a run goes, the workflow is locked: nodes can't be changed until it ends.

When a run fails, N-WAVE explains common reasons in plain language and links to
[Troubleshooting](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting).

## Execution settings

The **Execution Settings** button in the bottom bar opens the workflow's settings:

| Tab | What you set |
| --- | --- |
| **Execution** | Whether steps run in Docker containers (recommended) and the default image for steps without their own. Also shows whether Docker and Nextflow are available. |
| **Output** | The **Output Directory** (default `results`) and the **Output Naming Pattern** for run folders (`{workflow_name}`, `{timestamp}`, `{date}`). |
| **Resources** | **Use the global limits** (from [Global Settings](https://github.com/HCIstudio/N-WAVE/wiki/Settings)), or turn it off to set lower **Maximum CPU Cores**, **Maximum Memory** and **Execution Timeout** for this workflow. Values above the global limits are lowered to them. |
| **Profiles** | **Use the global run profile**, or turn it off to choose this computer or another profile for this workflow ([Run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles)). |
| **Advanced** | The Nextflow version, what to do when a step fails, and clean-up after a failure. |

Below the tabs, **Run cache** shows how much space the workflow's cache takes.

## Resources and time limits

The run's CPUs and memory are capped at what the server allows: by default all CPUs and 80% of
the memory, set with `NWAVE_MAX_CPUS` and `NWAVE_MAX_MEMORY`. A step that asks for more is
lowered to the limit instead of failing. Runs without their own timeout stop after 24 hours
(`NWAVE_EXECUTION_TIMEOUT`). The run's first lines say which limits it got. With Docker
Desktop, Docker's own memory setting also applies
([Troubleshooting](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#docker-desktop-doesnt-have-enough-memory)).

## All runs, on the home page

The home page lists every workflow's runs under **Runs**, newest first: pick one for its log
and results, or open its workflow. Runs that go on show there too, with **Stop all running** to
stop them at once (each can be resumed later). Each workflow's card says how its last run went.

## Resuming a run

After a run fails or is cancelled, fix what went wrong and run again with **Resume** on (the
switch on the Run button; it's on by default after a failure, or as
[Global Settings → Resume](https://github.com/HCIstudio/N-WAVE/wiki/Settings#resume) says). The run reuses every step whose
code and inputs haven't changed and only runs what you changed and what follows. The switch is
greyed until a saved workflow has a run with a cache. When a run fails, its notice offers
**Resume** too.

The cache is each step's work folder. **Execution Settings → Run cache** shows its size and
clears it; results and logs stay. **Global Settings → Run cache** does the same for all workflows.

A long run can tell you when it ends while you're in another tab: turn on
[notifications](https://github.com/HCIstudio/N-WAVE/wiki/Settings#notifications) in Global Settings.

## When N-WAVE stops during a run

Stopping N-WAVE (`docker compose down`, or Ctrl+C on `pnpm dev`) stops its runs too, giving
Nextflow up to 30 seconds to finish cleanly. The history records them as *Stopped because
N-WAVE shut down*. If N-WAVE ends without that chance (a crash, a killed container or a
restart of the computer), it stops what is left of those runs when it starts again and records
them as *Interrupted*. Either way, resume the run to reuse the steps it finished.

## Where the results are

Each run has a folder in the output directory, named by the naming pattern, for example
`results/My_workflow_1792595038060/` (with the Docker setup, `results/` is next to
`latest.yml`):

| In the run folder | What it holds |
| --- | --- |
| `results/` | The published outputs: Display Output files, and each nf-core node's `<node name>/` folder. |
| `inputs/` | The uploaded files and samplesheets. |
| `workflow/` | The script and config that ran. |
| `nextflow/` | Nextflow's work folders (the run cache) and its log. |
| `nwave_reports/<run>/` | Nextflow's execution report, timeline and trace (`execution_trace.txt`, tab separated) of each run, also of resumed ones. |
| `nwave-run.log` | The output the run panel showed. |

The run panel's **Results** and each node's **Results** tab open these files in the browser.
A resumed run continues in the folder of the run it resumes.

## See also

- [nf-core pipelines](https://github.com/HCIstudio/N-WAVE/wiki/Running-the-nf-core-rnaseq-Example)
- [Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects), to run
  elsewhere

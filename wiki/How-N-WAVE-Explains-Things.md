N-WAVE explains things in several places: problems in a workflow before it runs, connections
whose files may not fit, why a run failed, and what a term means. This page lists every kind of
explanation, where it appears, what it is based on, how sure it is and what it can get wrong.
Each explanation in the app links to its section here.

| Explanation | Where it appears | Based on | How sure |
| --- | --- | --- | --- |
| [Workflow check problems](#workflow-check-problems) | The check in the canvas's bottom bar, the marked nodes | Fixed rules on the canvas, and what the server reports (Nextflow, Docker, limits) | Errors: the run would fail or do nothing. Warnings: it may not be what you want |
| [Connection hints](#connection-hints) | Yellow dashed connections, inputs marked while dragging, the workflow check | nf-core modules' metadata (`meta.yml` file patterns) and file names | A hint, never a block: the metadata isn't always complete |
| [Failure explanations](#failure-explanations) | The run panel (Steps and Log tabs), the failure notice, earlier runs | Fixed rules matched against the run's log | Each says **Cause** (certain) or **Likely cause**, and shows the log lines it went by |
| [Suggested fixes](#suggested-fixes) | The failure notice, when no failure explanation fits | Words in the error message | Guesses |
| [Glossary and Help](#glossary-and-help) | ⓘ buttons next to terms, the Help page | Written by hand | Checked by people, but general: not about your workflow |
| [AI companion](#ai-companion) | Not in N-WAVE yet | — | — |

None of these explanations are sent anywhere: they are worked out in your browser and on your
N-WAVE server. In verbose mode (see [Settings](https://github.com/HCIstudio/N-WAVE/wiki/Settings#verbose-mode)) N-WAVE records which
failure explanations were shown and the answers to *Did this help?*.

## Workflow check problems

**Where:** the workflow check in the canvas's bottom bar lists them; each one can show the node
it is about.

**Based on:** fixed rules, applied to the nodes and connections on the canvas (an empty
workflow, a loop, an input nothing is connected to, a File Input without a file, an nf-core
component that isn't installed, a samplesheet or parameter that can't be read, more connections
than an input takes), and on what the server reports: whether Nextflow and Docker are available,
and the most CPUs and memory a run may use.

**How sure:** errors (red) are problems the run would fail on or that would make it do nothing;
depending on the settings they keep the workflow from running. Warnings (yellow) let it run:
the workflow may still be what you want, for example a node that isn't connected yet.

**Limits:** the check looks at the workflow's shape, not at the data or the tools' options. A
workflow without problems can still fail (a wrong reference genome, too little memory for a
large file), and the check can't see into custom processes' scripts or imported `.nf` files.

## Connection hints

**Where:** a connection whose files may not fit is drawn yellow and dashed, with a ⚠ button
that says why; while you drag a connection, inputs that don't fit are marked; the workflow check
lists them as warnings.

**Based on:** what each port carries. For nf-core modules that is the file patterns in the
module's `meta.yml` (for example `*.{bam,cram,sam}`); for common inputs without a pattern, the
input's name (`fasta`, `gtf`, `bam`, …); for File Input nodes, the uploaded files' names.

**How sure:** a hint, never a block. N-WAVE keeps the connection and only warns.

**Limits:** module metadata is written by people and isn't always complete, so a hint can be
wrong; you may know better. Ports whose contents aren't known (most built-in steps, custom
processes, channel operators) are never flagged. Only file types are compared, not what is in
the files (a FASTA of the wrong species fits).

## Failure explanations

**Where:** above the steps and the log in the run panel, in the notice that appears when a run
fails, and with each failed run in the run history (when *Failure explanations* is on in
Global Settings → Features).

**Based on:** the run's log. N-WAVE has a fixed list of rules, one per common failure, each
looking for what Nextflow, Docker or N-WAVE's backend prints when it happens. The rules are tried
in order and the first that matches is shown. Each explanation shows the lines it went by
(*Based on these lines of the log*), with *Show in log* to open the full log at that line, and
the step's exit status when Nextflow printed one.

**How sure:** each rule says how sure it is.

- **Cause:** the lines mean one thing. Only this failure prints them.
- **Likely cause:** the lines fit this failure, but other problems can print the same. The
  explanation lists what else it could be (*It could also be*).

**Limits:** only the failures below are recognised; for any other failure N-WAVE shows no
explanation (and the notice shows [suggested fixes](#suggested-fixes)). Only one explanation is
shown, even when the log has more than one problem. The rules are tested with real logs from
Nextflow 25.10 and 26.04; other versions may word their messages differently. What to do about
each failure is on the [Troubleshooting](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#run-failures) page.

### Resource limits

**Based on:** the line `N-WAVE resource problem: …` that N-WAVE's backend adds to the log when a
run was stopped by the limits it set (time, memory, CPUs).
**How sure:** certain: the backend knows the limits it gave the run.
**Limits:** only for limits N-WAVE sets, not a cluster's own.

### Task time limit

**Based on:** `Process exceeded running time limit (…)`, or `process hasn't exited` (newer
Nextflow versions).
**How sure:** certain with the first; likely with the second.
**Could also be:** Docker was slow to stop or clean up the step's container, so Nextflow couldn't
read how it ended; the computer was so busy that the container stopped answering.

### Out of memory

**Based on:** a step that ended with exit status 137, or a program's own out-of-memory message
(`java.lang.OutOfMemoryError`, `std::bad_alloc`, `OOMKilled`).
**How sure:** certain with a program's own message; likely with exit status 137, which means the
step was killed: almost always for memory, but not only.
**Could also be:** the step was cancelled, or a cluster or Docker ended it for running too long.

### Docker unavailable

**Based on:** `Cannot connect to the Docker daemon` or `failed to connect to the docker API`.
**How sure:** certain.
**Limits:** says that Docker didn't answer, not why (not installed, not started, no permission).

### Container pull

**Based on:** `pull access denied`, `manifest unknown` or `Failed to pull`; or any
`docker: Error response from daemon`.
**How sure:** certain with the first three; likely with the last.
**Could also be:** Docker couldn't start the container for another reason (a mount, a port or a
platform it doesn't support); the full message is in the log.

### Command not found

**Based on:** `…: command not found`, or a step that ended with exit status 127.
**How sure:** certain with `command not found`; likely with exit status 127 alone.
**Could also be:** the step's script calls another script or tool by a path that doesn't exist;
the script starts with an interpreter (`#!`) that isn't in the container.

### No space

**Based on:** `No space left on device`.
**How sure:** certain.
**Limits:** doesn't say which disk was full (Docker's, the work folder's or a temporary one).

### Pipeline download

**Based on:** GitHub's `Forbidden` answer or `API rate limit exceeded` when Nextflow fetches an
nf-core pipeline; or `Cannot find nf-core/…`.
**How sure:** certain when GitHub refused; likely when the pipeline wasn't found.
**Could also be:** the pipeline's name or version is misspelled.

### Plugin download

**Based on:** `ERROR ~ Conversion = '…'` (what Nextflow prints when the plugin registry's answer
can't be read), or `Cannot find plugin`, `Unable to download plugin`, `Plugin with id … not
found`.
**How sure:** likely.
**Could also be:** the pipeline asks for a plugin version that doesn't exist, or one this
Nextflow version can't use; a proxy answers in place of the registry and returns something else.

### Unreachable URL

**Based on:** `Can't stage file https://…` (or `ftp://`, `s3://`), `UnknownHostException`,
`Could not resolve host`, `Connection refused` or `Server returned HTTP response code`.
**How sure:** likely.
**Could also be:** the file needs a login, or the link has expired; the server was down for a
moment, and running again may work.

### Missing input

**Based on:** `No such file or directory: …`, `No files match pattern`, `Not a valid path value`
or `Path value cannot be null`.
**How sure:** likely.
**Could also be:** a path in the samplesheet or parameters is relative to another folder than the
one the run starts in; an earlier step was meant to make the file but didn't run.

### Missing output

**Based on:** `Missing output file(s) … expected by process …`, with the step's exit status.
**How sure:** likely.
**Could also be:** the step's command failed without an error exit status, so it wrote nothing;
the tool writes its file under a different name or into a subfolder (check its version).

## Suggested fixes

**Where:** the notice that appears when a run fails, when no [failure
explanation](#failure-explanations) fits.

**Based on:** words in the error message (`memory`, `docker`, `permission denied`, …), each with
general advice; without such words, general advice for any failure.

**How sure:** guesses. They don't look at the log's lines and can't say which step failed.

## Glossary and Help

**Where:** the ⓘ buttons next to terms in the app, and the Help page (what N-WAVE does, the
node colors, the canvas and the glossary).

**Based on:** written by hand by N-WAVE's developers, from the Nextflow and nf-core
documentation; each term links to the guide in this wiki that says more.

**How sure:** checked by people, but general: a term's explanation says what it means, not what
it does in your workflow.

**Limits:** short by design, so they leave out detail and exceptions. If one is wrong or unclear,
please [open an issue](https://github.com/HCIstudio/N-WAVE/issues).

## AI companion

N-WAVE has no AI companion yet; it is planned (see the roadmap in N-WAVE). When it comes, this
section will say what its answers are based on, how they are marked in the app, and their limits.

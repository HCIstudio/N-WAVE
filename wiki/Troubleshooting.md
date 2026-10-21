When a run fails for a common reason, N-WAVE says so in plain language: in the error notice,
the run panel and the run's entry under **History**, with the step it happened in (**Show**
moves the canvas to it) and a link to the matching section below. The full output is under
the run panel's **Log** tab. For the words used here, see the **Glossary** in N-WAVE (home
page → Glossary).

**On this page:** [Run failures](#run-failures) ·
[Installation and Docker](#installation-and-docker) · [Files and paths](#files-and-paths) ·
[Clusters](#clusters) · [The browser demo](#the-browser-demo)

## Run failures

### Out of memory

The step used more memory than it was given and was killed (exit status 137). Raise
**Maximum Memory** in *Execution Settings → Resources*, or the step's memory in its panel.
On Docker Desktop, also give Docker more memory (*Settings → Resources*).

### The run hit its resource limits

A step asked for more CPUs or memory than the run may use, or the run reached its time
limit. The run's first lines say which limits it got. Raise them in
*Execution Settings → Resources*. The server caps them with `NWAVE_MAX_CPUS`,
`NWAVE_MAX_MEMORY` and `NWAVE_EXECUTION_TIMEOUT` (24 hours by default; see
[Configuration](https://github.com/HCIstudio/N-WAVE#configuration)).

### Docker isn't reachable

The step runs in a container, but Docker isn't running or N-WAVE can't reach it. Start Docker
(Docker Desktop on Windows and macOS) and wait until it says it's running. **Check again** in
the workflow check (next to the Run button) shows when N-WAVE can reach it.

### Container image can't be pulled

Docker couldn't download the step's image: the name or tag is wrong, the image doesn't exist,
or the registry can't be reached from this computer's network or proxy. Check a custom
process's image, and that this computer can reach `quay.io` and `docker.io`.

### Command not found

The step runs a program that isn't installed where it ran (exit status 127). Without
Docker, the program isn't installed on the computer: turn on Docker in
*Execution Settings → Execution*. In a container, the image doesn't have it: give a custom
process an image that does. Also check the command for typos.

### No space left on device

The disk the run writes to is full. Delete old runs from `results/`, clear workflows'
run caches (*Execution Settings → Run cache*) and remove unused Docker images
(`docker system prune`). On Docker Desktop, raise the disk size (*Settings → Resources*).

### URL can't be reached

An input given as an address (`https://…`) couldn't be downloaded: the address is wrong, or
it can't be reached from this computer. Open it in a browser, check the network or proxy, or
upload the file instead.

### Input file not found

A file the workflow reads isn't where it looks. Upload it to a File Input node, and check
that the names in samplesheets and parameters match the uploaded files exactly.

### Missing output files

The step finished but didn't write a file it declares as output. For a custom process, check
that its script writes exactly the file names in its `output:` block.

## Installation and Docker

### The first run is slow

The first run downloads Nextflow (the `nextflow/nextflow` image), then each step's container
image, and for a pipeline the pipeline itself. That can take many minutes and several GB.
Later runs reuse the downloads. Fix a failed run and use **Resume** to skip the steps that
already finished ([Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows#resuming-a-run)).

### Docker Desktop doesn't have enough memory

Docker Desktop gives its containers a fixed amount of memory, often 2 to 8 GB. Steps that need
more fail with [Out of memory](#out-of-memory) even if the computer has more. Raise it in
*Settings → Resources → Memory* and restart Docker Desktop. The examples need 8 GB; aligning
reads to a human or mouse genome needs about 40 GB.

### Apple Silicon and other ARM computers

N-WAVE itself runs natively. Many Nextflow images exist only for Intel/AMD, so the runner
uses that platform by default and Docker emulates it, which is slower. If your Nextflow
version has an ARM image, set `NEXTFLOW_PLATFORM=native` on the backend.

### "client version 1.32 is too old"

Docker Engine 29 and newer refuse the old Docker client in the Nextflow images. N-WAVE
handles this itself; if it still happens, set `DOCKER_API_VERSION` on the backend to the
version `docker version` reports as the server's minimum API version.

### The page doesn't open, or shows no workflows

Check that the containers run (`docker compose -f latest.yml ps`), that nothing else uses
port 5173 or 5001, and that you open the address N-WAVE allows (`CORS_ORIGIN`, see
[Installation](https://github.com/HCIstudio/N-WAVE/wiki/Installation#who-can-reach-n-wave)).

## Files and paths

### Windows paths

Nextflow doesn't run on Windows itself; use the
[Docker installation](https://github.com/HCIstudio/N-WAVE/wiki/Installation) (Docker Desktop
with WSL 2). There, Nextflow only sees the `results` folder:

- Keep *Execution Settings → Output → Output Directory* at `results` or a folder inside it.
  A Windows path such as `C:\data` can't be used.
- Give inputs as uploaded files or URLs, not as `C:\…` paths in samplesheets or parameters.
- Write paths with forward slashes (`results/run1`), also on Windows.

### Uploaded files are gone after a reload

Files up to 256 KB are saved with the workflow. Larger files stay in the browser tab only, so
after a reload the workflow check asks you to upload them again. One run's uploads may total
about 37 MB; for larger data, use URLs (or absolute paths where Nextflow runs on the computer
itself) in a Samplesheet or Parameters node.

## Clusters

### SLURM jobs wait forever

The jobs ask for more than the partition allows, usually more time per step than its limit
(`squeue` shows `PartitionTimeLimit`). Lower *Time per step* in the run profile or choose
another partition. See [Run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles).

### "Running through a SLURM profile needs …"

N-WAVE can only submit jobs when its backend runs Nextflow on a machine that has `sbatch`.
The Docker installation can't; export the project and run it on the cluster instead
([Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects)).

## The browser demo

The [browser demo](https://hcistudio.github.io/N-WAVE/) has no server: it can't run
workflows, and it keeps your workflows, custom nodes and installed nf-core modules in this
browser only (clearing site data removes them). Export a project to run it elsewhere, or
[install N-WAVE](https://github.com/HCIstudio/N-WAVE/wiki/Installation).

## Still stuck?

Search the [issues](https://github.com/HCIstudio/N-WAVE/issues) or open one with how you run
N-WAVE, the steps to reproduce and the run's log.

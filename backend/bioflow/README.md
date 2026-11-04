# backend/bioflow: workflow analysis with BioFlow-Insight

N-WAVE analyses a workflow's code with
[BioFlow-Insight](https://gitlab.liris.cnrs.fr/sharefair/bioflow-insight)
(Marchment, Brancotte, Schmit, Lemoine, Cohen-Boulakia: *BioFlow-Insight:
facilitating reuse of Nextflow workflows with structure reconstruction and
visualization*, NAR Genomics and Bioinformatics 6(3), lqae092, 2024,
[doi:10.1093/nargab/lqae092](https://doi.org/10.1093/nargab/lqae092)).
BioFlow-Insight reads Nextflow code without running it and finds the
workflow's steps, how they connect, under which conditions they run and which
steps belong together.

This folder is the image N-WAVE runs for that. It holds:

| File | What it is |
| --- | --- |
| `requirements.in` | The package, pinned to one version |
| `requirements.txt` | It and every dependency, pinned with hashes (`pip-compile --generate-hashes requirements.in`) |
| `language-server.sha256` | The hash of the Nextflow language server the package bundles, checked when the image is built |
| `Dockerfile` | Python 3.12, Java 17 and Graphviz, the packages above, `analyse.py` |
| `analyse.py` | Runs BioFlow-Insight and writes N-WAVE's JSON (below) |
| `tests/` | Contract tests: projects and the JSON recorded for each |
| `UPDATING.md` | What to check before taking a new version |

The package is used as published, not copied into N-WAVE.

## How N-WAVE runs it

The backend sends the project (the workflow's script and the nf-core modules
it includes) as JSON on stdin and reads the result from stdout:

```bash
docker run --rm -i --network none --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 2 \
  hcistudio/nwave-bioflow:<version> --stdin < project.json
```

- No network: everything the analysis uses is in the image.
- Nothing of N-WAVE's is mounted; the project exists only in the container's
  `/tmp` while it runs. Nothing is sent to a service outside the installation.
- A time limit (`NWAVE_BIOFLOW_TIMEOUT`, in seconds, 120 by default).

Without the image (or with `NWAVE_BIOFLOW=off`), N-WAVE works as before and
says the analysis isn't available.

To try it on a folder:

```bash
docker build -t nwave-bioflow backend/bioflow
docker run --rm --network none --read-only --tmpfs /tmp \
  -v "$PWD/my-project:/project:ro" nwave-bioflow /project
```

## N-WAVE's JSON (`n-wave-bioflow/1`)

N-WAVE reads this format only, never BioFlow-Insight's own objects or files;
the backend checks every result against it (`backend/src/analysis/bioflowResult.ts`).
The same project always gives the same document: no times, no memory
addresses, no paths outside the project.

```jsonc
{
  "schema": "n-wave-bioflow/1",
  "tool": { "name": "BioFlow-Insight", "version": "2.1.1", "engine": "nls" },
  "dsl": "DSL2",
  // The error BioFlow-Insight (or Nextflow's parser) found in the code, or null.
  "error": { "code": "ewlsif", "message": "Nextflow's parser found an error in the code.", "file": "main.nf" },
  "notes": [],
  // Processes as called: one step per call, in the subworkflow it's called in.
  "steps": [
    {
      "id": "GENOME.STATS_INDEX",   // the calls' names from the top, joined by dots
      "name": "STATS_INDEX",        // the name it's called by (include alias)
      "process": "STATS",           // the process's own name
      "file": "modules/local/stats/main.nf",
      "subworkflow": "GENOME",      // id of the subworkflow call, or null
      "code": "process STATS { … }",
      "conditions": []              // the conditions it runs under
    }
  ],
  // One step's outputs reach the other (the process dependency graph).
  "connections": [{ "from": "GENOME.INDEX", "to": "GENOME.STATS_INDEX" }],
  "subworkflows": [
    { "id": "GENOME", "name": "GENOME", "workflow": "PREPARE_GENOME",
      "file": "subworkflows/local/prepare_genome/main.nf", "parent": null }
  ],
  "conditions": [{ "condition": "params.trim", "steps": ["TRIM"] }],
  // Groups of steps BioFlow-Insight's abstractions find; parent is an index
  // into the same list. null when an abstraction failed (see notes).
  "groups": { "condition": [], "dominator": [{ "steps": ["…"], "parent": null }], "parallel": [] },
  "metrics": {
    "steps": 5, "processes": 3, "connections": 3, "subworkflow_calls": 2,
    "subworkflow_depth": 1, "conditions": 0, "conditional_steps": 0, "files": 6, "lines": 73
  }
}
```

**Engines.** For DSL2, Nextflow's own parser (the language server bundled in
the package, `"engine": "nls"`) reads the code. When it finds an error, the
result carries that error, and BioFlow-Insight's own parser (`"bioflow"`) reads
the structure as far as it can. DSL1 is read by BioFlow-Insight's parser.

**Mapping to the canvas.** A step maps to a canvas node by its name, its file
and its code; a subworkflow by its name and file.

## Known gaps in 2.1.1

What `analyse.py` works around, to report upstream:

- With Nextflow's parser, processes have no name (`get_name()` is empty) and
  subworkflow calls lose their alias. `analyse.py` reads the name from the
  process's code and the alias from the include in the calling file.
- `get_metadata_process_dependency_graph()` fails with Nextflow's parser;
  `analyse.py` counts the metrics itself.
- `get_all_nextflow_files()` starts BioFlow-Insight's own parser again when
  Nextflow's parser was used, so `analyse.py` doesn't call it.
- A process chosen with a ternary (`(params.flag ? A : B) | C`) isn't found.
- Nextflow's parser rejects scripts that include plugins (`from 'plugin/nf-schema'`):
  it can't look them up without network. `analyse.py` then says the code
  couldn't be checked (a note, not an error) and BioFlow-Insight's own parser
  reads the structure.
- The emit of a subworkflow that sets its channel again inside an `if` block
  (`.set { ch_trim_reads }` in nf-core/fastq_trim_fastp_fastqc) isn't
  followed (`frontend/scripts/bioflow/knownDifferences.json`).

## Tests

```bash
docker run --rm --network none --read-only --tmpfs /tmp \
  -v "$PWD/backend/bioflow/tests:/opt/bioflow/tests:ro" \
  --entrypoint python nwave-bioflow -I /opt/bioflow/tests/contract.py
```

`--update` (with the folder mounted writable and `--user 0`) records the
current output; do that only as described in `UPDATING.md`. CI also compares
BioFlow-Insight's connections with those of N-WAVE's importer for every lint
fixture (`frontend/scripts/bioflow/crossCheck.ts`).

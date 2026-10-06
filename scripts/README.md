# nf-core modules in N-WAVE

N-WAVE can use any module or subworkflow from
[nf-core/modules](https://github.com/nf-core/modules) as a node. This page explains how
modules are turned into nodes, what the generated code does with their inputs, how
subworkflows work, and how to add a manual adapter for a module the automatic path gets
wrong.

## The catalog

`frontend/src/registry/nfcore/catalog.json` (copied to
`backend/src/workflows/library/assets/nf-core/catalog.json`) lists every module with the
information N-WAVE needs to call it. It is generated from a checkout of nf-core/modules:

```bash
cd frontend
pnpm nfcore:catalog                           # latest master
NFCORE_MODULES_REF=<branch-or-tag> pnpm nfcore:catalog
```

The generator (`generate-nfcore-catalog.mjs` in this directory) reads each module's `main.nf` and
`meta.yml`. Input parsing lives in `nfcoreModuleParser.mjs` and is unit tested
(`node --test scripts/nfcoreModuleParser.test.mjs`, also run in CI). All modules are pinned to one commit,
recorded in the catalog's `source.commit`; installing a module downloads its files at that
commit.

Each module gets a support level:

| Level | Meaning |
|-------|---------|
| `full` | Has a curated N-WAVE node with its own settings panel (FastQC, Trimmomatic). |
| `candidate` | Every input was understood; the module installs automatically. |
| `needs_review` | Some input or output couldn't be mapped; installing is disabled and `installability.reasons` says why. |

## How inputs become ports and settings

Every declaration in a module's `input:` block is one argument of the module call. The
catalog stores them as `inputGroups`, in declaration order, each with an `items` list:

| Declaration | Becomes |
|-------------|---------|
| `tuple val(meta), path(reads)` | One input port, `reads`. The tuple is built in the workflow (see below). |
| `tuple val(meta2), path(index), path(gtf)` | Two ports, `index` and `gtf`, combined into one tuple. |
| `path fasta` / `path(fasta)` | One port, `fasta`. |
| `path("quants/*")`, `path ('genes/*')` | One port named after the directory (`quants`). |
| `val sort_bam`, `val(mode)` | A setting in the node panel under **Module inputs**. |
| `tuple val(meta), path(intervals), val(scale)` | Port `intervals` plus setting `scale`. |

Value settings get their type from `meta.yml` (`boolean`, `integer`, `float`, `string`;
anything else is entered as a Groovy expression) and a default from the description when it
says `default= …`, otherwise `false`, `0`, `''` or `[]`.

Port names must be unique within a node, so a repeated name gets a suffix (`index_2`).

### Channel modes

Each path field has a mode that decides how its upstream channel is fed to the module:

| Mode | Used for | Generated |
|------|----------|-----------|
| `each` | The first input (per-sample data) and further fields in a `meta` tuple | The upstream channel as is |
| `first` | Later inputs: `meta2`/`meta3` tuples and plain `path` inputs (indexes, references) | `upstream.first()`, a value channel every task can use |
| `collect` | Directory staging such as `path("quants/*")` | All upstream files in one task |

### What the generated code does

For every argument the generator emits one channel, then calls the module in declaration
order. For `star/align` connected to reads, an index and a GTF file:

```groovy
ch_star_reads_nfcore = reads_ch
    .map { in0 ->
        def filesOf = { item -> /* files of a [meta, files] item, or the item */ }
        def metaOf = { item -> /* meta map of a [meta, files] item, or null */ }
        def reads = filesOf(in0)
        def meta = metaOf(in0) ?: [id: (reads instanceof List ? reads[0] : reads).simpleName, single_end: !(reads instanceof List && reads.size() > 1)]
        tuple(meta, reads)
    }
ch_star_index_nfcore = index_ch.first()
    .map { in0 -> /* tuple(meta, index) */ }
STAR(ch_star_reads_nfcore, ch_star_index_nfcore, [[:], []], false)
```

- **meta** is taken from the upstream item when it is an nf-core output (`[meta, files]`),
  otherwise it is built from the first file name (`single_end` from the number of files).
- **Several fields in one tuple** from different upstream nodes are combined; per-sample
  fields are matched by `meta.id`, so a BAM is paired with its own index.
- **Unconnected inputs** are passed as empty placeholders, `[]` or `[[:], []]`, the way
  nf-core pipelines skip optional inputs. The node only waits for its first input; whether
  an empty input is acceptable is up to the module.
- **Modules without inputs** (database downloads) are called with no arguments.

The node's **Code** tab shows exactly this code for the current settings.

## Installed modules and catalog updates

Installed modules live in `$NWAVE_DATA_DIR/nf-core/modules/nf-core/<module>` with an
`nwave.adapter.json` manifest. When the catalog is regenerated, modules installed from the
same commit pick up the new input layout automatically. Modules installed from an older
commit keep their stored layout and show a notice in the node panel: reinstall them from the
nf-core Library so their files and layout match. Installed modules can be removed from the
library again (`POST /api/nfcore/uninstall`).

No module files ship with N-WAVE. Installing downloads every file the catalog lists for the
module (`files.paths`: `main.nf`, `meta.yml`, `environment.yml`, `templates/…`; not
`tests/`) from `raw.githubusercontent.com` at the catalog's commit. When a run uses a module
that isn't installed yet, the backend installs it before starting Nextflow, so curated nodes
such as FastQC and imported workflows work on a fresh install. The Code tab and Export
Project read an installed module's files, or fetch them from GitHub when it isn't installed.

In the online demo there is no backend: the library installs modules into the browser
(`localStorage`), keeping each module's adapter manifest and its `main.nf`, fetched from
GitHub at the catalog's commit. Export Project fetches the remaining module files the same
way. The catalog itself is a static asset loaded the first time
the library is opened.

## Subworkflows

The catalog also lists the subworkflows in `subworkflows/nf-core/` (the `subworkflows` array,
catalog schema 3), parsed by `nfcoreSubworkflowParser.mjs`
(`node --test scripts/nfcoreSubworkflowParser.test.mjs`, also run in CI). For each one it
records:

- **takes**, in call order. A take is a *value* when its comment says so (`// val: …`,
  `// bool: …`) or, without a `channel` comment, when `meta.yml` types it as a string,
  boolean or number; every other take is a *channel*.
- **emits**, the node's outputs.
- **components**: the modules (`../../../modules/nf-core/<module>`) and subworkflows
  (`../<name>`) it includes. A subworkflow that includes a plugin, a local file or something
  that can't be installed is unsupported; `installability.reasons` says why.

A subworkflow node has an input port per channel take and a setting per value take, like a
module's `val` inputs. Each channel input also has a setting for the expression passed while
nothing is connected, shaped after the take's comment: `// channel: [ val(meta), path(fasta) ]`
gives `Channel.value([[:], []])`, which nf-core modules read as "no file". The node waits for
at least one connection, and several connections to one input are mixed. The generated code
includes the subworkflow under an alias and calls it like a module:

```groovy
include { BAM_SORT_STATS_SAMTOOLS as NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_N1 } from './subworkflows/nf-core/bam_sort_stats_samtools/main'

workflow {
    NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_N1(bams, Channel.value([[:], [], []]))
    n1_bam = NFCORE_SUBWORKFLOW_BAM_SORT_STATS_SAMTOOLS_N1.out.bam
}
```

Processes inside the subworkflow are named `<alias>:<PROCESS>`. The node's **Process
config** setting adds selectors for them to the `process` config, for example
`withName: '.*:SAMTOOLS_SORT' { ext.prefix = { "${meta.id}.sorted" } }`. The `nextflow.config`
files some subworkflows ship are suggestions written for nf-core pipelines; they are copied
with the subworkflow but not applied.

Installing a subworkflow also installs the modules and subworkflows it includes (directly or
through nested subworkflows) that aren't installed yet, at the catalog's commit. They appear
in the node menu as well. Installed subworkflows live in
`$NWAVE_DATA_DIR/nf-core/subworkflows/nf-core/<name>`. Before a run, the backend installs
missing subworkflows with what they include, and copies them into the run's
`subworkflows/nf-core/` next to `modules/nf-core/`. Export Project does the same, reading
each subworkflow's includes to find the files it needs.

**Convert to custom node** works on subworkflow nodes too: the custom node holds the
workflow, renamed, with its includes rewritten relative to `main.nf`; its takes, values,
placeholders and process config are kept.

## Manual adapters

When the automatic mapping is wrong for a module, there are three levels of fixes.

1. **Channel mode override.** If only a field's mode is wrong (for example MultiQC, whose
   first input must collect every QC file), add it to `channelModeOverrides` in
   `scripts/generate-nfcore-catalog.mjs` and regenerate the catalog:

   ```js
   const channelModeOverrides = {
     multiqc: { multiqc_files: "collect" },
   };
   ```

2. **Parser support.** If a declaration form isn't understood, `installability.reasons`
   names it (`Unsupported tuple token: …`). Extend `parseQualifier` /
   `parseInputDeclaration` in `scripts/nfcoreModuleParser.mjs`, add a test for the form in
   `scripts/nfcoreModuleParser.test.mjs`, and regenerate.

3. **Curated adapter.** For a module that needs custom settings or input handling, write an
   `NfCoreModuleAdapter` in `frontend/src/registry/nfcoreModuleAdapters.ts`, as FastQC and
   Trimmomatic do:
   - `inputs` / `inputGroups` describe the ports and the call arguments;
   - `outputs` map ports to the module's `emit` names;
   - `defaults` and a panel component provide settings;
   - `buildExtArgs(node)` turns those settings into `task.ext.args`.

   Register it in `nfCoreModuleAdapters` and add the module to `curatedAdapterModules` in
   the catalog generator. Its files are installed on demand like any other module, at the
   catalog's commit.

Without changing N-WAVE at all, any module can also be used by converting its node to a
custom node (**Code** tab → **Convert to custom node**) and editing the code there.

# nf-core modules in N-WAVE

N-WAVE can use any module from [nf-core/modules](https://github.com/nf-core/modules) as a
node. This page explains how modules are turned into nodes, what the generated code does with
their inputs, and how to add a manual adapter for a module the automatic path gets wrong.

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
| `full` | Bundled with a hand-written adapter (FastQC, Trimmomatic). |
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
library again (`POST /api/nfcore/uninstall`); bundled modules can't.

In the online demo there is no backend: the library installs modules into the browser
(`localStorage`), keeping each module's adapter manifest and its `main.nf`, fetched from
GitHub at the catalog's commit. The catalog itself is a static asset loaded the first time
the library is opened.

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

3. **Bundled adapter.** For a module that needs custom settings or input handling, write an
   `NfCoreModuleAdapter` in `frontend/src/registry/nfcoreModuleAdapters.ts`, as FastQC and
   Trimmomatic do:
   - `inputs` / `inputGroups` describe the ports and the call arguments;
   - `outputs` map ports to the module's `emit` names;
   - `defaults` and a panel component provide settings;
   - `buildExtArgs(node)` turns those settings into `task.ext.args`.

   Register it in `nfCoreModuleAdapters`, add the module to `fullSupportModules` in the
   catalog generator, and copy its files to
   `backend/src/workflows/library/assets/nf-core/modules/nf-core/<module>` so it works
   without installing.

Without changing N-WAVE at all, any module can also be used by converting its node to a
custom node (**Code** tab → **Convert to custom node**) and editing the code there.

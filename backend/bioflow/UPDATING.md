# Updating BioFlow-Insight

N-WAVE uses one version of `bioflow-insight`, pinned in `requirements.in` and,
with every dependency and its hash, in `requirements.txt`. Dependabot proposes
new versions one at a time (label `bioflow-update`); none is merged without
the checks below. The same goes for an update of the image's base
(`python:3.12-slim-bookworm`).

The package is someone else's code that N-WAVE runs on users' workflows. It
runs without network and with a read-only file system, but it still sees the
workflow's code, so each version is read, not just tested.

## Before merging

Get the old and the new wheel side by side:

```bash
pip download --no-deps bioflow-insight==<old> -d old
pip download --no-deps bioflow-insight==<new> -d new
(cd old && unzip -q *.whl) && (cd new && unzip -q *.whl)
diff -ru old new | less
```

1. **What changed in the package.** Read the diff of `src/` and the CLI, and
   the project's changes (its repository and PyPI page). Note anything that
   changes what `analyse.py` calls (`Workflow`, `initialise_with_language_server`,
   `initialise_with_bioflow`, `get_process_dependency_graph_dico`,
   `get_most_influential_conditions`, the abstractions, and the ids of its
   graphs: memory addresses that `analyse.py` looks up among the live objects
   instead of with the package's `get_object`).
2. **The language server.** `src/language_server_source_code/language-server-all.jar`
   is a build of Nextflow's language server. Compare its hash with
   `language-server.sha256` (the image build fails when it differs). When it
   changed: find out which version or fork it is built from and what changed
   there, then update `language-server.sha256`.
3. **The license.** The package's `LICENSE` file (MIT in 2.1.1), its PyPI
   metadata and its README must still allow N-WAVE's use (Apache-2.0, see
   NOTICE). When they disagree, ask the authors before merging.
4. **New access.** Search the diff for running commands, files outside the
   project and the output folder, network and git:
   `os.system`, `subprocess`, `os.chdir`, `open(` with paths it builds,
   `shutil`, `urllib`, `requests`, `socket`, `git`, and in the Java part
   anything that downloads (the language server's plugin registry).
   2.1.1 runs `git checkout` only when given a commit (`commit_2_set`), which
   `analyse.py` never does; it changes the working directory and writes a
   results folder, which `analyse.py` puts in a temporary folder.
5. **Dependency pins.** Regenerate `requirements.txt`
   (`pip-compile --generate-hashes --strip-extras --allow-unsafe requirements.in`
   with Python 3.12) and read what changed. New dependencies are read like
   the package itself. The package's numpy pin decides the Python version.
6. **Every difference in the output.** Build the image and run the contract
   tests (README.md, "Tests"). Each changed line is explained: a fix (good),
   a regression (report upstream, don't merge), or a change in format that
   `analyse.py` has to translate back. Only then record the new outputs with
   `--update`, in the same pull request.
7. **The cross-check.** `scripts/bioflow-cross-check.sh` with the new image.
   A difference that goes away removes its entry from
   `frontend/scripts/bioflow/knownDifferences.json`; a new one is a bug in
   either tool.
8. **Run time.** Time the analysis of the lint fixtures and of a large
   pipeline (nf-core/rnaseq) with the old and the new image, with the limits
   the backend sets (`--memory 2g --cpus 2`). It must stay well inside the
   backend's time limit (`NWAVE_BIOFLOW_TIMEOUT`, 120 s).

Write what you found in the pull request, one line per point.

## Upstream

What the checks find in the package goes to its authors as an issue or a
contribution: patterns it doesn't read, differences the cross-check finds,
and the gaps `analyse.py` works around (README.md, "Known gaps").

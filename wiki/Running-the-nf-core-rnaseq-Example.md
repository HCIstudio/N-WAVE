This page walks through the built-in **nf-core/rnaseq Example**: the complete
[nf-core/rnaseq](https://nf-co.re/rnaseq/3.27.0) 3.27.0 pipeline, set up on the N-WAVE canvas
and preset to the pipeline's small test data.

### What the example does
The workflow has three nodes plus notes that explain them:

| Node | What it holds |
| --- | --- |
| **Samplesheet** | The pipeline's test samplesheet: 7 sequencing runs of yeast RNA-seq (GSE110004), 4 paired-end and 3 single-end. The reads are downloaded from the nf-core test-datasets repository during the run. |
| **Reference genome** (Parameters) | `fasta` (genome sequence) and `gtf` (gene annotation) from the nf-core test data. |
| **nf-core/rnaseq** (Pipeline) | nf-core/rnaseq 3.27.0 with **Use the pipeline's test profile** ticked. The samplesheet is connected to `--input`, the references to `--fasta` and `--gtf`. |

The pipeline runs with its default settings: read QC (FastQC), trimming (Trim Galore), alignment
with STAR and quantification with Salmon (`--aligner star_salmon`), followed by a MultiQC report.

N-WAVE launches it as

```bash
nextflow run nf-core/rnaseq -r 3.27.0 -profile test,docker -params-file params.json --outdir results
```

with `params.json` pointing `input` at the samplesheet and `fasta`/`gtf` at the reference URLs.

### Requirements
- The **Docker installation** of N-WAVE (see [Dockerized Installation](https://github.com/HCIstudio/N-WAVE/wiki/Dockerized-Installation)).
  The browser demo on GitHub Pages can open, inspect and export the example, but not run it.
- Internet access: Nextflow downloads the pipeline from GitHub, its containers (several GB on
  the first run) and the test data.
- **4 CPUs and at least 6 GB of memory** for Docker. The example's execution settings limit the
  run to 4 CPUs and 8 GB; N-WAVE lowers these to what the server allows
  (`NWAVE_MAX_CPUS` / `NWAVE_MAX_MEMORY`, default: all CPUs and 80% of the memory).
  On Docker Desktop, check *Settings → Resources*.
- Time: about 15–30 minutes on a laptop, plus the first downloads.

### Running it
1. Open N-WAVE and click the **nf-core/rnaseq Example** card on the home page.
2. Double-click the **nf-core/rnaseq** node to see its settings: the parameters from the
   pipeline's schema, the launch command and the params file.
3. Click **Run Workflow** in the bottom bar. The output streams in while the pipeline runs; you can
   cancel it at any time.
4. When the run finishes, double-click the **nf-core/rnaseq** node again. Its **Results** section
   links the key reports: open `multiqc/star_salmon/multiqc_report.html` for the summary of every
   sample (QC, alignment rates, counts) and `pipeline_info/execution_report_*.html` for Nextflow's
   resource usage per task. **All result files** lists everything else, e.g. the gene counts in
   `star_salmon/salmon.merged.gene_counts.tsv`.

The example is read-only. Changing anything (moving a node, editing a setting, saving) makes an
editable copy first; the results of a run on the read-only example are shown until you leave the
page, so duplicate it first if you want to keep them with the workflow.

### Using your own data
1. Duplicate the example (or change something, which duplicates it).
2. In the **Samplesheet** node, replace the rows with your runs. Columns: `sample` (runs with the
   same name are merged), `fastq_1`, `fastq_2` (empty for single-end reads) and `strandedness`
   (`auto`, `forward`, `reverse` or `unstranded`). Read paths can be URLs, absolute paths on the
   server, or the names of files uploaded to a **File Input** node.
3. In the **Reference genome** node, set `fasta` and `gtf` to your organism's files (for example
   from Ensembl or GENCODE).
4. In the **nf-core/rnaseq** node, untick **Use the pipeline's test profile**: it also sets
   test-only parameters (a test Salmon index, BBSplit references, a Kraken database, ...).
5. Raise **Maximum CPU Cores** and **Maximum Memory** in *Execution Settings → Resources*. A human
   or mouse genome needs about 40 GB of memory for the STAR index.

### Running it outside N-WAVE
**Export Project** in the bottom bar downloads a folder with `run.sh`, `params.json`,
`inputs/samplesheet.csv` and a README. With Nextflow and Docker installed, run `bash run.sh` in
that folder; results go to `results/`.

### Troubleshooting
- **A task ran out of memory / requirement exceeds available memory**: raise the memory limit
  in the execution settings, or `NWAVE_MAX_MEMORY` on the server, and Docker's memory.
- **The run stops after 24 hours**: that's the default time limit; change *Execution Timeout* in the
  execution settings or `NWAVE_EXECUTION_TIMEOUT` on the server.
- **Downloads fail**: the pipeline needs access to github.com, raw.githubusercontent.com and the
  container registries (quay.io, community.wave.seqera.io).

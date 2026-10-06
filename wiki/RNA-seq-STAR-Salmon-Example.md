The built-in **RNA-seq (STAR + Salmon)** example rebuilds the default route of
[nf-core/rnaseq](https://nf-co.re/rnaseq/3.27.0) from library nodes. Every step is a node you
can open, inspect (its **Code** tab shows the Nextflow it adds) and change. It is also the
reference for building your own pipelines in N-WAVE: nothing in it is special-cased in the
app.

### What's on the canvas
| Part | Nodes |
| --- | --- |
| Inputs | **Samplesheet** (4 samples of the nf-core/rnaseq test data: 3 paired-end, 1 single-end) and **Reference genome** (a Parameters node with the test genome FASTA and gzipped GTF). |
| Genome preparation | **Unzip GTF** (nf-core/gunzip) → **Filter GTF** (nf-core/custom/gtffilter, which drops annotation on sequences that aren't in the genome) → **Transcript FASTA** (nf-core/gffread `-w`), **STAR index** (nf-core/star/genomegenerate) and **Salmon index** (nf-core/salmon/index). |
| Reads | **FastQC (raw reads)** and **Trim Galore**. |
| Alignment and quantification | **STAR alignment** (nf-core/star/align, with the options nf-core/rnaseq 3.27.0 uses, including `--quantMode TranscriptomeSAM`) → **Salmon quantification** (nf-core/salmon/quant, alignment mode, `--libType A`). |
| Statistics | **SAMtools sort, index, stats** (the nf-core/bam_sort_stats_samtools subworkflow). |
| Report | **Collect QC reports** (a channel operator that mixes every report into one channel) → **MultiQC**. |

Notes on the canvas explain each part. Every node uses only library features: settings
like STAR's options are the node's **Extra arguments**, and output names are its **Output
prefix**.

### Opening it
Open **RNA-seq (STAR + Salmon)** on the home page. Its 11 nf-core components (10 modules and
one subworkflow) aren't installed on a fresh install. A banner lists them; click **Install
them**. The subworkflow brings in five samtools modules and the `bam_stats_samtools`
subworkflow. In the browser demo they install into the browser.

The example is read-only. Opening panels and Code tabs doesn't change it. Changing a
setting or moving a node makes an editable copy.

### Running it (Docker install)
**Run Workflow** in the bottom bar. The run takes a few minutes on a laptop; the first run
also pulls the module containers.

Each nf-core node saves its outputs to `results/<node name>/`:
- `results/salmon_quantification/<sample>/quant.sf`: transcript quantifications.
- `results/star_alignment/`: alignments and STAR logs.
- `results/samtools_sort_index_stats/`: sorted BAMs, indexes and statistics.
- `results/multiqc/multiqc_report.html`: the report, covering FastQC, Cutadapt (Trim Galore),
  STAR, Salmon and SAMtools for every sample.

When the run finishes, the run panel lists **Results**. Click `multiqc/multiqc_report.html`
to open the report, or expand **All result files**.

### Running the exported project
**Export Project** downloads `main.nf`, `nextflow.config`, the nf-core modules and
subworkflows it uses, `inputs/samplesheet.csv` and a README. With Nextflow and Docker
installed:

```bash
nextflow run main.nf -profile docker
```

The results go to `results/`, in the same layout as above.

### Manual check (release testing)
1. Start a fresh Docker install of N-WAVE (`docker compose up -d`).
2. Open **RNA-seq (STAR + Salmon)**, click **Install them** and wait for the banner to go.
3. Click **Run Workflow**. The run should finish with "Workflow Complete".
4. In the run panel's **Results**, open `multiqc/multiqc_report.html`. It should list four
   samples with FastQC, Cutadapt, STAR, Salmon and SAMtools sections.
5. In **All result files**, check that `salmon_quantification/<sample>/quant.sf` exists for
   all four samples.
6. Click **Export Project**, unzip it, run `nextflow run main.nf -profile docker` and check
   that `results/multiqc/multiqc_report.html` and the four `quant.sf` files are there.

### Using your own data
1. Duplicate the example.
2. Replace the samplesheet rows and the reference FASTA and GTF (an uncompressed GTF works
   too: delete **Unzip GTF** and connect the GTF to **Filter GTF**).
3. In **STAR index**, remove `--genomeSAindexNbases 7` from the extra arguments. It only
   suits the tiny test genome.
4. Raise CPUs and memory in **Execution Settings → Resources**: a human or mouse STAR index
   needs about 40 GB of memory.

### What the full pipeline does in addition
nf-core/rnaseq also:
- merges several runs of a sample;
- infers strandedness;
- removes rRNA (SortMeRNA, RiboDetector) and contaminant reads (BBSplit);
- offers other aligners and quantifiers (HISAT2, RSEM, Bowtie 2, Kallisto) and UMI handling;
- adds QC (RSeQC, Qualimap, dupRadar, Preseq, DESeq2 PCA);
- builds gene-level count matrices with tximport.

To run all of that, use the **nf-core/rnaseq Example**, which runs the whole pipeline as one
node.

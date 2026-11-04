// Subworkflows in their own files, one included under another name, and a
// process called twice under two names.
params.reads = 'reads/*.fastq'
params.fasta = 'genome.fasta'

include { PREPARE_GENOME as GENOME } from './subworkflows/local/prepare_genome/main'
include { QC } from './subworkflows/local/qc/main'
include { ALIGN } from './modules/local/align/main'
include { STATS as STATS_ALIGNED } from './modules/local/stats/main'

workflow {
    ch_reads = channel.fromPath(params.reads)
    GENOME(channel.fromPath(params.fasta))
    QC(ch_reads)
    ALIGN(ch_reads.combine(GENOME.out.index))
    STATS_ALIGNED(ALIGN.out.out)
}

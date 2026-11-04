// A channel set in both branches of an `if`: from a step in one, from the
// input in the other. It stays a channel of its own on the way back.
params.reads = 'reads/*.fastq'
params.trim = true

process TRIM {
    input:
    path reads

    output:
    path 'trimmed.fastq', emit: reads

    script:
    "cp ${reads} trimmed.fastq"
}

process ALIGN {
    input:
    path reads

    output:
    path 'aligned.bam'

    script:
    "touch aligned.bam"
}

workflow {
    ch_reads = channel.fromPath(params.reads)
    if (params.trim) {
        TRIM(ch_reads)
        ch_align = TRIM.out.reads
    } else {
        ch_align = ch_reads
    }
    ALIGN(ch_align)
}

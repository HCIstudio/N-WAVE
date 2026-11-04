// Steps that run only under some parameter values.
params.reads = 'reads/*.fastq'
params.trim = true
params.skip_qc = false

process QC {
    input:
    path reads

    output:
    path 'qc.txt'

    script:
    "echo qc > qc.txt"
}

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

process REPORT {
    input:
    path files

    output:
    path 'report.html'

    script:
    "touch report.html"
}

workflow {
    ch_reads = channel.fromPath(params.reads)
    if (!params.skip_qc) {
        QC(ch_reads)
    }
    if (params.trim) {
        TRIM(ch_reads)
        ch_align = TRIM.out.reads
    } else {
        ch_align = ch_reads
    }
    ALIGN(ch_align)
    REPORT(ALIGN.out.collect())
}

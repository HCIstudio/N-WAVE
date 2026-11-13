// The same step in two arms: on raw reads in one, on trimmed reads in the other.
params.trim = true
params.reads = "${projectDir}/reads.txt"

process FASTQC {
    input:
    path reads

    output:
    path "fastqc.txt", emit: html
    path "fastqc_versions.yml", emit: versions

    script:
    """
    wc -c < ${reads} > fastqc.txt
    echo fastqc: 1 > fastqc_versions.yml
    """
}

process TRIM {
    input:
    path reads

    output:
    path "trimmed.txt", emit: reads
    path "trim_versions.yml", emit: versions

    script:
    """
    tr a-z A-Z < ${reads} > trimmed.txt
    echo trim: 1 > trim_versions.yml
    """
}

process REPORT {
    input:
    path aligned
    path versions

    output:
    path "report.txt"

    script:
    """
    cat ${aligned} ${versions} > report.txt
    """
}
workflow {
    ch_reads = channel.fromPath(params.reads)
    ch_qc = channel.empty()
    if (params.trim) {
        TRIM(ch_reads)
        FASTQC(TRIM.out.reads)
        ch_qc = FASTQC.out.html
    } else {
        FASTQC(ch_reads)
        ch_qc = FASTQC.out.html
    }
    REPORT(ch_qc, ch_reads)
}

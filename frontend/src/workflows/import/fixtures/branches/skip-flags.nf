// nf-core style: optional steps behind skip flags, a nested choice, and versions collected from whichever ran.
params.skip_qc = false
params.skip_trimming = false
params.aligner = 'star'
params.reads = "${projectDir}/reads.txt"

process STAR {
    input:
    path reads

    output:
    path "aligned.txt", emit: bam
    path "star_versions.yml", emit: versions

    script:
    """
    echo star > aligned.txt
    echo star: 1 > star_versions.yml
    """
}

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
    ch_versions = channel.empty()

    // Quality control
    if (!params.skip_qc) {
        FASTQC(ch_reads)
        ch_versions = ch_versions.mix(FASTQC.out.versions)
    }

    ch_trimmed = ch_reads
    if (!params.skip_trimming) {
        TRIM(ch_reads)
        ch_trimmed = TRIM.out.reads
        ch_versions = ch_versions.mix(TRIM.out.versions)
        if (params.aligner == 'star') {
            STAR(ch_trimmed)
            ch_versions = ch_versions.mix(STAR.out.versions)
        }
    }

    ch_versions_all = ch_versions.collect()
    REPORT(ch_trimmed, ch_versions_all)
}

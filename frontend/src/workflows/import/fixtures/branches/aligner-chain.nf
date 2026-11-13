// Three aligners, one chosen by params.aligner (if / else if / else), as nf-core pipelines choose a tool.
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

process HISAT2 {
    input:
    path reads

    output:
    path "aligned.txt", emit: bam
    path "hisat2_versions.yml", emit: versions

    script:
    """
    echo hisat2 > aligned.txt
    echo hisat2: 1 > hisat2_versions.yml
    """
}

process BOWTIE2 {
    input:
    path reads

    output:
    path "aligned.txt", emit: bam
    path "bowtie2_versions.yml", emit: versions

    script:
    """
    echo bowtie2 > aligned.txt
    echo bowtie2: 1 > bowtie2_versions.yml
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
    ch_bam = channel.empty()
    if (params.aligner == 'star') {
        STAR(ch_reads)
        ch_bam = STAR.out.bam
    } else if (params.aligner == 'hisat2') {
        HISAT2(ch_reads)
        ch_bam = HISAT2.out.bam
    } else {
        BOWTIE2(ch_reads)
        ch_bam = BOWTIE2.out.bam
    }
    REPORT(ch_bam, channel.of(file("${projectDir}/reads.txt")))
}

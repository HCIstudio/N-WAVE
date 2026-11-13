// A for loop in a workflow: Nextflow's strict syntax rejects it; it stays code.
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
    for (name in ['a', 'b']) {
        println name
    }
    FASTQC(ch_reads)
}

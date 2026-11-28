// Channel code that calls a step (in a conditional expression): the canvas
// can't connect it, so it shows a dashed line from the code to the step, and
// the workflow check says so.
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
    ch_trimmed = params.trim ? TRIM(ch_reads).reads : ch_reads
    ALIGN(ch_trimmed)
}

// Channel code that calls a step (piped): the canvas can't connect it, so it
// shows a dashed line from the code to the step, and the workflow check says so.
params.reads = 'reads/*.fastq'

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
    ch_trimmed = ch_reads | TRIM
    ALIGN(ch_trimmed)
}

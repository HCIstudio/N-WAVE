// A typed process (Nextflow's preview of static types, NXF_SYNTAX_PARSER=v2):
// its inputs are names with types, a tuple is destructured, and an output is
// named by its declaration.
nextflow.preview.types = true

process COUNT_READS {
    input:
    (_meta, reads): Tuple<Map,Path>
    min_length: Integer

    stage:
    env 'MIN_LENGTH', min_length

    output:
    counts: Path = file('counts.txt')

    script:
    """
    wc -l ${reads} > counts.txt
    """
}

workflow {
    def samples = channel.fromPath('data/*.fq').map { fq -> [ [id: fq.simpleName], fq ] }
    COUNT_READS(samples, 30)
    COUNT_READS.out.counts.view()
}

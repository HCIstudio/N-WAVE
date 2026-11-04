include { INDEX } from '../../../modules/local/index/main'
include { STATS as STATS_INDEX } from '../../../modules/local/stats/main'

workflow PREPARE_GENOME {
    take:
    fasta

    main:
    INDEX(fasta)
    STATS_INDEX(INDEX.out.out)

    emit:
    index = INDEX.out.out
}

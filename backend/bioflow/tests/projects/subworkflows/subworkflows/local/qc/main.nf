include { STATS as STATS_READS } from '../../../modules/local/stats/main'

workflow QC {
    take:
    reads

    main:
    STATS_READS(reads)

    emit:
    stats = STATS_READS.out.out
}

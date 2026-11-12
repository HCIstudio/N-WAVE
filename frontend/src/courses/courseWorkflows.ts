// The workflows two advanced courses start from, imported from Nextflow when
// the course starts: one whose second step fails (When a run fails), and one
// with a choice between two aligners (Read a workflow's structure).

/** Two steps; SHOUT has a typo (`trr` for `tr`), a program that doesn't exist. */
export const FAILING_SCRIPT = `process SAY_HELLO {
    output:
    path 'greeting.txt'

    script:
    """
    echo 'Hello from N-WAVE' > greeting.txt
    """
}

process SHOUT {
    input:
    path greeting

    output:
    path 'shout.txt'

    script:
    """
    trr a-z A-Z < \${greeting} > shout.txt
    """
}

workflow {
    SAY_HELLO()
    SHOUT(SAY_HELLO.out)
}
`;

/**
 * Trimming, a check, one of two aligners (by params.aligner) and a report of
 * whichever ran: the way nf-core pipelines choose a tool (a channel set in
 * each arm of an if/else). It imports as a Branch node with the aligners in it.
 */
export const STRUCTURE_SCRIPT = `params.aligner = 'star'

process TRIM {
    output:
    path 'trimmed.txt'

    script:
    """
    echo 'ACGT' > trimmed.txt
    """
}

process QC {
    input:
    path reads

    output:
    path 'qc.txt'

    script:
    """
    wc -c < \${reads} > qc.txt
    """
}

process ALIGN_STAR {
    input:
    path reads

    output:
    path 'aligned.txt'

    script:
    """
    echo 'star' > aligned.txt
    """
}

process ALIGN_HISAT {
    input:
    path reads

    output:
    path 'aligned.txt'

    script:
    """
    echo 'hisat2' > aligned.txt
    """
}

process REPORT {
    input:
    path aligned
    path qc

    output:
    path 'report.txt'

    script:
    """
    cat \${aligned} \${qc} > report.txt
    """
}

workflow {
    TRIM()
    QC(TRIM.out)
    ch_aligned = channel.empty()
    if (params.aligner == 'star') {
        ALIGN_STAR(TRIM.out)
        ch_aligned = ALIGN_STAR.out
    } else {
        ALIGN_HISAT(TRIM.out)
        ch_aligned = ALIGN_HISAT.out
    }
    REPORT(ch_aligned, QC.out)
}
`;

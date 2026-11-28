// Steps called through pipes (with an operator in between) and outputs taken
// apart by a tuple assignment.

process DOUBLE {
    input:
    val x

    output:
    val y, emit: doubled

    script:
    y = x * 2
    """
    echo ${y}
    """
}

process SPLIT {
    input:
    val x

    output:
    val x, emit: small
    val x, emit: large

    script:
    """
    echo ${x}
    """
}

process REPORT {
    input:
    val small
    val large

    output:
    stdout emit: text

    script:
    """
    echo ${small} ${large}
    """
}

workflow {
    channel.of(1, 2, 3) | DOUBLE | map { n -> n + 1 } | SPLIT
    (small, large) = SPLIT.out
    REPORT(small, large)
    REPORT.out.text.view()
}

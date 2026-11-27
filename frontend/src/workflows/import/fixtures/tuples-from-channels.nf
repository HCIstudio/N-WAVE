// Processes whose tuple inputs a call gives whole channels: a tuple of values
// only (from a filtered channel), a tuple of a value and two files, and a
// tuple of a file and a value.

process MEASURE {
    input:
    val(site)
    val(band)

    output:
    tuple val(site), val(band), emit: pairs

    script:
    """
    echo ${site} ${band}
    """
}

process SCORE {
    input:
    tuple val(site), val(band)

    output:
    tuple val(site), path('a.txt'), path('b.txt'), emit: files

    script:
    """
    echo ${site} > a.txt
    echo ${band} > b.txt
    """
}

process COMPARE {
    input:
    tuple val(site), path(a), path(b)

    output:
    tuple path('diff.txt'), val(site), emit: diff

    script:
    """
    diff ${a} ${b} > diff.txt || true
    """
}

process REPORT {
    input:
    tuple path(diff), val(site)

    output:
    path('report.txt'), emit: report

    script:
    """
    cat ${diff} > report.txt
    """
}

workflow {
    def bands = channel.of("red", "nir", "swir")
    MEASURE(params.site, bands)
    SCORE(MEASURE.out.pairs.filter { site, band -> band != "swir" })
    COMPARE(SCORE.out.files)
    REPORT(COMPARE.out.diff)
}

process STATS {
    input:
    path input

    output:
    path 'stats.out', emit: out

    script:
    "touch stats.out"
}

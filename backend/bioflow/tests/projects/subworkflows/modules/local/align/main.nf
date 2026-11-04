process ALIGN {
    input:
    path input

    output:
    path 'align.out', emit: out

    script:
    "touch align.out"
}

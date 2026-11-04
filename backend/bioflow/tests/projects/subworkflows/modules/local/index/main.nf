process INDEX {
    input:
    path input

    output:
    path 'index.out', emit: out

    script:
    "touch index.out"
}

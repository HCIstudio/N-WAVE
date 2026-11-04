// Calls a process the script doesn't define: Nextflow's parser rejects it.
process HELLO {
    output:
    path 'hello.txt'

    script:
    "echo hello > hello.txt"
}

workflow {
    HELLO()
    GOODBYE(HELLO.out)
}

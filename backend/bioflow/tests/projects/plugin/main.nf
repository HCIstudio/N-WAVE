// Includes a plugin, which the analysis (without network) can't read.
include { samplesheetToList } from 'plugin/nf-schema'

process A {
    input:
    val x

    output:
    stdout

    script:
    "echo ${x}"
}

workflow {
    A(channel.fromList(samplesheetToList(params.input, "schema.json")))
}

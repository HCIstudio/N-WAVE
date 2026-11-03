#!/usr/bin/env nextflow

params.input = "${projectDir}/data/*.txt"
params.skip_count = false

process countLines {
  input: path text
  output: path 'lines.txt'
  script:
  """
  wc -l < ${text} > lines.txt
  """
}

process shout {
  input:
  path text
  output:
  stdout
  script:
  """
  tr a-z A-Z < ${text}
  """
}

process sayDone {
  script:
  """
  echo done
  """
}

workflow {
  input_ch = channel.fromPath(params.input)

  (count_ch, skip_ch) = params.skip_count
    ? [channel.empty(), input_ch]
    : [input_ch, channel.empty()]

  // Count, then shout what was counted.
  count_ch | countLines | mix(skip_ch) | shout | view

  if (!params.skip_count) {
    sayDone()
  }
}

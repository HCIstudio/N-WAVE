params {
  input: Path = 'samples.csv'
  greeting: String = 'Hello'
}

def banner(name) {
  return "== ${name} =="
}

process GREET {
  input:
  tuple val(id), val(name)
  output:
  tuple val(id), path("${id}.txt"), emit: greeting
  script:
  """
  echo '${params.greeting} ${name}' > ${id}.txt
  """
}

workflow {
  main:
  log.info banner('greetings')

  people = channel.fromPath(params.input)
    .splitCsv(header: true)
    .map { row -> [row.id, row.name] }

  sorted = people.branch { _id, name ->
    short_name: name.size() < 5
    long_name: true
  }

  greetings = GREET(sorted.short_name.mix(sorted.long_name))

  publish:
  greetings = greetings

  onComplete:
  log.info "Finished: ${workflow.success}"
}

output {
  greetings {
    path 'greetings'
  }
}

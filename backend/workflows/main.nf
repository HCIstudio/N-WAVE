nextflow.enable.dsl = 2

params.outdir = params.outdir ?: "/shared/data/smoke-${workflow.runName}"

process SysInfo {
  publishDir params.outdir, mode: 'copy'
  output: path 'uname.txt'
  """
  uname -a > uname.txt
  """
}

workflow { SysInfo() }

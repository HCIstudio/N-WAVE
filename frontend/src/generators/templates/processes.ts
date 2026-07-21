// Generic process template for custom Nextflow process generation.

export interface ProcessConfig {
  processName: string;
  cpuCount: number;
  memoryAmount: string;
  [key: string]: unknown;
}

export function generateGenericProcess(
  config: ProcessConfig & {
    script?: string;
    containerImage?: string;
    timeLimit?: string;
  }
): string {
  const {
    processName,
    cpuCount,
    memoryAmount,
    script = '"""\necho "Hello World"\n"""',
    containerImage = "ubuntu:22.04",
    timeLimit = "1.h",
  } = config;

  return `process ${processName} {
    container '${containerImage}'
    cpus ${cpuCount}
    memory '${memoryAmount}'
    time '${timeLimit}'
    errorStrategy 'retry'
    maxRetries 2

    input:
    val x

    output:
    stdout

    script:
    ${script}
}`;
}

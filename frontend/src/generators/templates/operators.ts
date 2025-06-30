// Operator process templates for Nextflow script generation

import type { ProcessConfig } from "./processes";

export function generateFilterProcess(
  config: ProcessConfig & {
    filterText?: string;
    filterMode?: string;
    filterNegate?: boolean;
  }
): string {
  const {
    processName,
    cpuCount,
    memoryAmount,
    containerImage = "ubuntu:22.04",
  } = config;
  const { filterText, filterMode, filterNegate } = config;

  let filterScript = "";
  if (filterText && filterMode) {
    if (filterMode === "contains") {
      const negateFlag = filterNegate ? "-v" : "";
      filterScript = `grep ${negateFlag} "${filterText}" \${input_file} > "\${input_file.baseName}_filtered.txt" || echo "# Filter: No lines contained '${filterText}'" > "\${input_file.baseName}_filtered.txt"`;
    } else if (filterMode === "startsWith") {
      const negateFlag = filterNegate ? "-v" : "";
      filterScript = `grep ${negateFlag} "^${filterText}" \${input_file} > "\${input_file.baseName}_filtered.txt" || echo "# Filter: No lines started with '${filterText}'" > "\${input_file.baseName}_filtered.txt"`;
    } else if (filterMode === "endsWith") {
      const negateFlag = filterNegate ? "-v" : "";
      filterScript = `grep ${negateFlag} "${filterText}$" \${input_file} > "\${input_file.baseName}_filtered.txt" || echo "# Filter: No lines ended with '${filterText}'" > "\${input_file.baseName}_filtered.txt"`;
    } else if (filterMode === "regex") {
      const negateFlag = filterNegate ? "-v" : "";
      filterScript = `grep ${negateFlag} -E "${filterText}" \${input_file} > "\${input_file.baseName}_filtered.txt" || echo "# Filter: No lines matched regex '${filterText}'" > "\${input_file.baseName}_filtered.txt"`;
    }
  } else {
    filterScript = `cp \${input_file} "\${input_file.baseName}_filtered.txt"`;
  }

  return `process ${processName} {
    container '${containerImage}'
    cpus ${cpuCount}
    memory '${memoryAmount}'

    input:
    path input_file

    output:
    path "*_filtered.txt"

    script:
    """
    ${filterScript}
    """
  }`;
}

export function generateMapProcess(
  config: ProcessConfig & {
    mapOperation: string;
    mapChangeCase?: string;
    mapReplaceFind?: string;
    mapReplaceWith?: string;
  }
): string {
  const {
    processName,
    cpuCount,
    memoryAmount,
    containerImage = "ubuntu:22.04",
  } = config;
  const { mapOperation, mapChangeCase, mapReplaceFind, mapReplaceWith } =
    config;

  let transformScript = "";
  if (mapOperation === "changeCase") {
    const changeCase = mapChangeCase || "toUpperCase";
    if (changeCase === "toUpperCase") {
      transformScript = `cat \${input_file} | tr '[:lower:]' '[:upper:]' > "\${input_file.baseName}_mapped.txt"`;
    } else {
      transformScript = `cat \${input_file} | tr '[:upper:]' '[:lower:]' > "\${input_file.baseName}_mapped.txt"`;
    }
  } else if (mapOperation === "replaceText") {
    const findText = mapReplaceFind || "";
    const replaceText = mapReplaceWith || "";
    transformScript = `sed 's/${findText}/${replaceText}/g' \${input_file} > "\${input_file.baseName}_mapped.txt"`;
  } else {
    transformScript = `cp \${input_file} "\${input_file.baseName}_mapped.txt"`;
  }

  return `process ${processName} {
    container '${containerImage}'
    cpus ${cpuCount}
    memory '${memoryAmount}'

    input:
    path input_file

    output:
    path "*_mapped.txt"

    script:
    """
    ${transformScript}
    """
  }`;
}

export function generateMergeProcess(
  config: ProcessConfig & {
    mergeOperation?: string;
    joinType?: string;
    separator?: string;
    outputType?: string;
  }
): string {
  const {
    processName,
    cpuCount,
    memoryAmount,
    containerImage = "ubuntu:22.04",
    joinType = "txt",
    outputType = "txt",
  } = config;

  // Special handling for FASTQ
  if (outputType === "fastq") {
    return `process ${processName} {
      container '${containerImage}'
      cpus ${cpuCount}
      memory '${memoryAmount}'

      input:
      path input_files

      output:
      path "merged.fastq", emit: merged

      script:
      """
      # Pre-merge validation for each input file
      for f in $input_files; do
        lines=$(wc -l < "$f")
        if [ $((lines % 4)) -ne 0 ]; then
          echo "ERROR: $f is not a valid FASTQ (lines not multiple of 4)" >&2
          exit 1
        fi
        awk 'NR%4==3 && $1 != "+" {print "ERROR: $f, line " NR " does not start with +"; exit 1}' "$f"
      done

      # Merge
      cat $input_files > merged.fastq

      # Post-merge validation
      lines=$(wc -l < merged.fastq)
      if [ $((lines % 4)) -ne 0 ]; then
        echo "ERROR: merged.fastq is not a valid FASTQ (lines not multiple of 4)" >&2
        exit 1
      fi
      awk 'NR%4==3 && $1 != "+" {print "ERROR: merged.fastq, line " NR " does not start with +"; exit 1}' merged.fastq
      """
    }`;
  }

  // Default join for text files
  return `process ${processName} {
    container '${containerImage}'
    cpus ${cpuCount}
    memory '${memoryAmount}'

    input:
    path input_files

    output:
    path "merged.${joinType}", emit: merged

    script:
    """
    cat $input_files > merged.${joinType}
    """
  }`;
}

export function generateOperatorCode(
  operatorType: string,
  config: ProcessConfig
): string {
  switch (operatorType) {
    case "filter":
      return generateFilterProcess(config as any);
    case "map":
      return generateMapProcess(config as any);
    case "merge":
      return generateMergeProcess(config as any);
    default:
      throw new Error(`Unsupported operator type: ${operatorType}`);
  }
}

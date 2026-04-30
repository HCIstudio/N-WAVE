// Output process templates for Nextflow script generation

export interface OutputConfig {
  processName: string;
  cpuCount: number;
  memoryAmount: string;
  containerImage?: string;
  [key: string]: any;
}

export function generateOutputDisplayProcess(
  config: OutputConfig & {
    outputLabel: string;
    downloadFormat: string;
    selectedFileName: string;
    outputDisplayCounter: number;
    outputNamingPattern: string;
    workflowName: string;
    timestamp: number;
    date: string;
    processName: string;
  }
): string {
  const {
    processName,
    cpuCount,
    memoryAmount,
    containerImage = "ubuntu:22.04",
    outputLabel,
    downloadFormat,
    selectedFileName,
    outputDisplayCounter,
    outputNamingPattern,
    workflowName,
    timestamp,
    date,
  } = config;

  // Replace variables in the pattern
  const safePattern =
    outputNamingPattern || "{workflow_name}_{timestamp}_{process_name}";
  const basePattern = safePattern
    .replace(/\{workflow_name\}/g, workflowName)
    .replace(/\{timestamp\}/g, String(timestamp))
    .replace(/\{date\}/g, date)
    .replace(/\{process_name\}/g, processName);

  let outputFileName;
  let processScript;

  if (selectedFileName === "all") {
    // Concatenate all files with unique numbering
    outputFileName = `${basePattern}_${String(outputDisplayCounter).padStart(
      2,
      "0"
    )}_${outputLabel}.${downloadFormat}`;
    processScript = `"""
    echo "Combining input files into ${outputFileName}" >&2
    echo "=== Combined Output: ${outputLabel} ===" > "${outputFileName}"
    echo "Generated: \\$(date)" >> "${outputFileName}"
    echo "" >> "${outputFileName}"
    
    echo "Listing staged input files in Nextflow order:" >&2
    printf '%s\\n' $input_files >&2

    for file in $input_files; do
        if [ -f "\\$file" ]; then
            echo "Processing input file: \\$file" >&2
            echo "" >> "${outputFileName}"
            echo "=== File: \\$file ===" >> "${outputFileName}"
            cat "\\$file" >> "${outputFileName}"
            echo "" >> "${outputFileName}"
        else
            echo "Skipping: \\$file (not a file)" >&2
        fi
    done
    
    echo "=== End of Combined Output ===" >> "${outputFileName}"
    echo "Final output created: ${outputFileName}" >&2
    """`;
  } else {
    // Save individual file with enhanced content and unique numbering
    outputFileName = `${basePattern}_${String(outputDisplayCounter).padStart(
      2,
      "0"
    )}_${outputLabel}_\${input_file.baseName}.${downloadFormat}`;
    processScript = `"""
    echo "Processing file: \${input_file}" >&2
    echo "Output file: ${outputFileName}" >&2
    
    # Add header with metadata
    echo "=== ${outputLabel} Output ===" > "${outputFileName}"
    echo "Generated: \\$(date)" >> "${outputFileName}"
    echo "Source file: \${input_file}" >> "${outputFileName}"
    echo "" >> "${outputFileName}"
    echo "=== Content ===" >> "${outputFileName}"
    
    # Copy the actual content
    cat "\${input_file}" >> "${outputFileName}"
    
    echo "" >> "${outputFileName}"
    echo "=== End of Output ===" >> "${outputFileName}"
    
    echo "Output file created: ${outputFileName}" >&2
    """`;
  }

  return `process ${processName} {
    container '${containerImage}'
    cpus ${cpuCount}
    memory '${memoryAmount}'
    errorStrategy 'retry'
    maxRetries 2
    publishDir params.outdir, mode: 'copy'

    input:
    ${selectedFileName === "all" ? 'path input_files, name: "display_input_*"' : "file input_file"}

    output:
    file "${outputFileName}"

    script:
    ${processScript}
}`;
}

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

  let outputPattern: string;
  let processScript: string;

  if (selectedFileName === "all") {
    const outputPrefix = `${basePattern}_${String(outputDisplayCounter).padStart(
      2,
      "0"
    )}_${outputLabel}`;
    outputPattern = `${outputPrefix}*`;
    processScript = `"""
    MANIFEST="${outputPrefix}_manifest.txt"
    COMBINED="${outputPrefix}.txt"
    copied_count=0
    text_count=0

    echo "Saving output files for ${outputLabel}" >&2
    echo "=== Output Manifest: ${outputLabel} ===" > "\\$MANIFEST"
    echo "Generated: \\$(date)" >> "\\$MANIFEST"
    echo "" >> "\\$MANIFEST"

    echo "=== Combined Text Output: ${outputLabel} ===" > "\\$COMBINED"
    echo "Generated: \\$(date)" >> "\\$COMBINED"
    echo "" >> "\\$COMBINED"
    
    echo "Listing staged input files in Nextflow order:" >&2
    printf '%s\\n' $input_files >&2

    for file in $input_files; do
        if [ -f "\\$file" ]; then
            base=\\$(basename "\\$file")
            lower=\\$(printf '%s' "\\$base" | tr '[:upper:]' '[:lower:]')
            echo "Processing input file: \\$file" >&2
            echo "File: \\$base" >> "\\$MANIFEST"

            case "\\$lower" in
                *.txt|*.csv|*.tsv|*.json|*.log|*.md|*.yaml|*.yml)
                    echo "" >> "\\$COMBINED"
                    echo "=== File: \\$base ===" >> "\\$COMBINED"
                    cat "\\$file" >> "\\$COMBINED"
                    echo "" >> "\\$COMBINED"
                    text_count=\\$((text_count + 1))
                    ;;
                *)
                    target="${outputPrefix}_\\$base"
                    cp "\\$file" "\\$target"
                    echo "Copied artifact: \\$target" >> "\\$MANIFEST"
                    copied_count=\\$((copied_count + 1))
                    ;;
            esac
        else
            echo "Skipping: \\$file (not a file)" >&2
        fi
    done

    if [ "\\$text_count" -eq 0 ]; then
        rm -f "\\$COMBINED"
    else
        echo "=== End of Combined Text Output ===" >> "\\$COMBINED"
    fi

    echo "" >> "\\$MANIFEST"
    echo "Copied artifacts: \\$copied_count" >> "\\$MANIFEST"
    echo "Combined text files: \\$text_count" >> "\\$MANIFEST"
    echo "Output manifest created: \\$MANIFEST" >&2
    """`;
  } else {
    const outputPrefix = `${basePattern}_${String(outputDisplayCounter).padStart(
      2,
      "0"
    )}_${outputLabel}`;
    outputPattern = `${outputPrefix}*`;
    processScript = `"""
    echo "Processing file: \${input_file}" >&2
    base=\\$(basename "\${input_file}")
    lower=\\$(printf '%s' "\\$base" | tr '[:upper:]' '[:lower:]')

    case "\\$lower" in
        *.txt|*.csv|*.tsv|*.json|*.log|*.md|*.yaml|*.yml)
            output_file="${outputPrefix}_\\$base.${downloadFormat}"
            echo "=== ${outputLabel} Output ===" > "\\$output_file"
            echo "Generated: \\$(date)" >> "\\$output_file"
            echo "Source file: \${input_file}" >> "\\$output_file"
            echo "" >> "\\$output_file"
            echo "=== Content ===" >> "\\$output_file"
            cat "\${input_file}" >> "\\$output_file"
            echo "" >> "\\$output_file"
            echo "=== End of Output ===" >> "\\$output_file"
            ;;
        *)
            output_file="${outputPrefix}_\\$base"
            cp "\${input_file}" "\\$output_file"
            ;;
    esac

    echo "Output file created: \\$output_file" >&2
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
    ${selectedFileName === "all" ? "path input_files" : "file input_file"}

    output:
    path "${outputPattern}"

    script:
    ${processScript}
}`;
}

// Workflow Script for Untitled Workflow

params.outdir = 'results'

params.inputdir = "./inputs"
params.selected_files = ['Rolling_Volumes.csv']

ch_files = Channel.fromList(params.selected_files)
    .map { filename -> file("${params.inputdir}/${filename}") }


process outputDisplay_node_1772553841972 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'
    errorStrategy 'retry'
    maxRetries 2
    publishDir params.outdir, mode: 'copy'

    input:
    path '*'

    output:
    file "Untitled Workflow_1772553989217_01_Display_Output.txt"

    script:
    """
    echo "Combining input files into Untitled Workflow_1772553989217_01_Display_Output.txt" >&2
    echo "=== Combined Output: Display_Output ===" > "Untitled Workflow_1772553989217_01_Display_Output.txt"
    echo "Generated: \$(date)" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
    echo "" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
    
    # List all files in directory and process them (excluding output files and hidden files)
    echo "Listing all files in current directory:" >&2
    ls -la >&2
    
    # Process all non-hidden files except the output file
    for file in *; do
        # Skip if not a file or if it's the output file
        if [ -f "\$file" ] && [ "\$file" != "Untitled Workflow_1772553989217_01_Display_Output.txt" ]; then
            echo "Processing input file: \$file" >&2
            echo "" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
            echo "=== File: \$file ===" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
            cat "\$file" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
            echo "" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
        else
            echo "Skipping: \$file (not a file, is output file, or hidden)" >&2
        fi
    done
    
    echo "=== End of Combined Output ===" >> "Untitled Workflow_1772553989217_01_Display_Output.txt"
    echo "Final output created: Untitled Workflow_1772553989217_01_Display_Output.txt" >&2
    """
}

workflow {
    outputDisplay_node_1772553841972(ch_files.collect())
    // Save output from: Display Output

}

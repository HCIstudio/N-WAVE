// Workflow Script for Untitled Workflow

params.outdir = 'results'

params.inputdir = "./inputs"
params.selected_files = ['bee_movie.txt']

ch_files = Channel.fromList(params.selected_files)
    .map { filename -> file("${params.inputdir}/${filename}") }


process outputDisplay_node_1776502559808 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'
    errorStrategy 'retry'
    maxRetries 2
    publishDir params.outdir, mode: 'copy'

    input:
    path input_files, name: "display_input_*"

    output:
    file "Untitled Workflow_1776502615043_01_Display_Output.txt"

    script:
    """
    echo "Combining input files into Untitled Workflow_1776502615043_01_Display_Output.txt" >&2
    echo "=== Combined Output: Display_Output ===" > "Untitled Workflow_1776502615043_01_Display_Output.txt"
    echo "Generated: \$(date)" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
    echo "" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
    
    echo "Listing staged input files in Nextflow order:" >&2
    printf '%s\n' $input_files >&2
    
    for file in $input_files; do
        if [ -f "\$file" ]; then
            echo "Processing input file: \$file" >&2
            echo "" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
            echo "=== File: \$file ===" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
            cat "\$file" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
            echo "" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
        else
            echo "Skipping: \$file (not a file)" >&2
        fi
    done
    
    echo "=== End of Combined Output ===" >> "Untitled Workflow_1776502615043_01_Display_Output.txt"
    echo "Final output created: Untitled Workflow_1776502615043_01_Display_Output.txt" >&2
    """
}

process merge_node_1776502562527 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'

    input:
    path input_files, name: "merge_input_*"

    output:
    path "merged.txt", emit: merged

    script:
    """
    cat $input_files > merged.txt
    """
  }

process filter_node_1776502564854 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'

    input:
    path input_file

    output:
    path "*_filtered.txt"

    script:
    """
    grep  "Barry" ${input_file} > "${input_file.baseName}_filtered.txt" || echo "# Filter: No lines contained 'Barry'" > "${input_file.baseName}_filtered.txt"
    """
  }

process map_node_1776502571352 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'

    input:
    path input_file

    output:
    path "*_mapped.txt"

    script:
    """
    cat ${input_file} | tr '[:lower:]' '[:upper:]' > "${input_file.baseName}_mapped.txt"
    """
  }

process filter_node_1776502575977 {
    container 'ubuntu:22.04'
    cpus 1
    memory '2.GB'

    input:
    path input_file

    output:
    path "*_filtered.txt"

    script:
    """
    grep  "Bee" ${input_file} > "${input_file.baseName}_filtered.txt" || echo "# Filter: No lines contained 'Bee'" > "${input_file.baseName}_filtered.txt"
    """
  }

workflow {
    // Save output from: Display Output

    node_1776502564854_out = filter_node_1776502564854(ch_files)
    node_1776502571352_out = map_node_1776502571352(node_1776502564854_out)
    node_1776502575977_out = filter_node_1776502575977(ch_files)
    node_1776502562527_out_merge_inputs = node_1776502571352_out.concat(node_1776502575977_out)
    node_1776502562527_out = merge_node_1776502562527(node_1776502562527_out_merge_inputs.collect())
    outputDisplay_node_1776502559808(node_1776502562527_out.map { item -> file(item instanceof String ? "${params.inputdir}/${item}" : item) }.collect())
}

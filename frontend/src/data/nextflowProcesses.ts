import type { NextflowProcessCategory } from "./types";

export const nextflowProcesses: NextflowProcessCategory[] = [
  {
    category: "Input",
    processes: [
      {
        label: "File Input",
        description: "Provides a file as a channel.",
        type: "fileInput",
        icon: "FolderOpen",
        initialData: { outputs: [{ name: "out", isConnectable: true }] },
      },
    ],
  },
  {
    category: "Operators",
    processes: [
      {
        label: "Filter",
        description: "Filter items based on a condition.",
        type: "operator",
        icon: "Funnel",
        initialData: {
          operatorType: "filter",
          inputs: [{ name: "in" }],
          outputs: [{ name: "out", isConnectable: true }],
        },
      },
      {
        label: "Map",
        description: "Transform each item in a channel.",
        type: "operator",
        icon: "Wand",
        initialData: {
          operatorType: "map",
          mapOperation: "changeCase",
          mapChangeCase: "toUpperCase",
          mapReplaceFind: "",
          mapReplaceWith: "",
          inputs: [{ name: "in" }],
          outputs: [{ name: "out", isConnectable: true }],
        },
      },
      {
        label: "Merge",
        description: "Merge multiple files of the same type.",
        type: "operator",
        icon: "Minimize",
        initialData: {
          operatorType: "merge",
          mergeOperation: "join",
          mergeJoinSeparator: "\\n",
          inputs: [{ name: "in" }],
          outputs: [{ name: "out", isConnectable: true }],
        },
      },
    ],
  },
  {
    category: "Core",
    processes: [
      {
        label: "Process",
        description: "A custom Nextflow process.",
        type: "process",
        icon: "Cog",
        initialData: {
          inputs: [{ name: "in" }],
          outputs: [{ name: "out", isConnectable: true }],
        },
      },
      {
        label: "FastQC",
        type: "process",
        icon: "ClipboardCheck",
        description:
          "Runs FastQC on raw sequencing data for quality control assessment.",
        initialData: {
          processType: "fastqc", // Unique identifier for FastQC
          label: "FastQC",
          subtitle: "Quality Control",
          // Input configuration for FASTQ files
          inputs: [
            {
              name: "in",
              label: "FASTQ Files",
              isConnectable: true,
            },
          ],
          // Output configuration for FastQC results
          outputs: [
            {
              name: "reads_out",
              label: "FASTQ",
              isConnectable: true,
            },
            {
              name: "zip",
              label: "ZIP Archives",
              isConnectable: true,
            },
            {
              name: "html",
              label: "HTML Reports",
              isConnectable: true,
            },
          ],
          // Default FastQC configuration
          threads: 1,
          format: "",
          kmers: 7,
          nogroup: false,
          adapters: "",
          limits: "",
          containerImage: "biocontainers/fastqc:latest",
          cpus: 2,
          memory: "4.GB",
          timeLimit: "2.h",
        },
      },
      {
        label: "Trimmomatic",
        type: "process",
        icon: "Scissors",
        description:
          "Quality trimming and filtering of FASTQ reads using Trimmomatic.",
        initialData: {
          processType: "trimmomatic", // Unique identifier for Trimmomatic
          label: "Trimmomatic",
          subtitle: "Quality Trimming",
          // Input configuration for FASTQ files and optional FastQC reports
          inputs: [
            {
              name: "reads",
              label: "FASTQ",
              isConnectable: true,
            },
            {
              name: "qc_reports",
              label: "QC Reports",
              isConnectable: true,
            },
          ],
          // Output configuration for trimmed reads
          outputs: [
            {
              name: "trimmed_reads",
              label: "Trimmed",
              isConnectable: true,
            },
            {
              name: "unpaired_reads",
              label: "Unpaired",
              isConnectable: true,
            },
            {
              name: "trim_log",
              label: "Log",
              isConnectable: true,
            },
          ],
          // Default Trimmomatic configuration
          leading: 3,
          trailing: 3,
          slidingwindow: "4:15",
          minlen: 36,
          adapter_file: "",
          custom_steps: "",
          phred_score: "33",
          containerImage: "staphb/trimmomatic:latest",
          cpus: 4,
          memory: "4.GB",
          timeLimit: "4.h",
        },
      },
    ],
  },
  {
    category: "Output",
    processes: [
      {
        label: "Display Output",
        description: "Displays the final output of a workflow channel.",
        type: "outputDisplay",
        icon: "Eye",
        initialData: { inputs: [{ name: "in" }] },
      },
    ],
  },
];

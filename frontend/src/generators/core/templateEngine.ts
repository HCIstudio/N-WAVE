// Template engine that orchestrates all capability-specific templates

import {
  generateFastQCProcess,
  generateTrimmomaticProcess,
  generateGenericProcess,
  type ProcessConfig,
} from "../templates/processes";

import {
  generateOutputDisplayProcess,
  type OutputConfig,
} from "../templates/outputs";
import {
  generateFilterProcess,
  generateMapProcess,
  generateMergeProcess,
} from "../templates";
// Input functions for advanced template-based input handling
// Currently, file inputs are handled inline in generateNextflowScript.ts (simple, no escaping issues)
// These template functions are for potential future expansion to template-based input generation
// import {
//   generateFileInputChannels,
//   generateValueInputChannel,
//   generateParameterInput,
//   type InputConfig,
// } from "../templates/inputs";

export function generateProcessCode(
  processType: string,
  config: ProcessConfig
): string {
  switch (processType) {
    case "fastqc":
      return generateFastQCProcess(config);
    case "trimmomatic":
      return generateTrimmomaticProcess(config);
    default:
      return generateGenericProcess(config);
  }
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
      throw new Error(`Unknown operator type: ${operatorType}`);
  }
}

export function generateOutputCode(config: OutputConfig): string {
  return generateOutputDisplayProcess(config as any);
}

// Advanced input template functions - not currently used in main script generator
// File inputs work fine inline (simple, no complex escaping). These are for future template expansion.

// export function generateInputCode(inputType: string, config: any): any {
//   switch (inputType) {
//     case "fileInput":
//       return generateFileInputChannels(config);
//     case "valueInput":
//       return generateValueInputChannel(config);
//     case "parameterInput":
//       return generateParameterInput(config);
//     default:
//       throw new Error(`Unknown input type: ${inputType}`);
//   }
// }

export function generateWorkflowScript(
  processes: Array<{ type: string; config: ProcessConfig }>
): string {
  const processDefinitions = processes
    .map((p) => generateProcessCode(p.type, p.config))
    .join("\n\n");

  // Simple workflow structure
  const workflow = `
workflow {
    // Input channels
    ch_input = Channel.fromPath(params.inputdir + "/*.fastq*")
    
    // Process chain based on connections
    ${generateWorkflowLogic(processes)}
}
  `;

  return `#!/usr/bin/env nextflow

nextflow.enable.dsl = 2

params.outdir = 'results'
params.inputdir = 'inputs'
params.max_cpus = 8
params.max_memory = '16 GB'

${processDefinitions}

${workflow}
  `;
}

function generateWorkflowLogic(processes: any[]): string {
  // Simple logic - just chain the processes for now
  const processNames = processes.map((p) => p.config.processName);

  if (processNames.length === 0) return "";
  if (processNames.length === 1) return `${processNames[0]}(ch_input)`;

  let logic = `${processNames[0]}(ch_input)\n`;
  for (let i = 1; i < processNames.length; i++) {
    const prevProcess = processNames[i - 1];
    const currentProcess = processNames[i];
    logic += `    ${currentProcess}(${prevProcess}.out)\n`;
  }

  return logic;
}

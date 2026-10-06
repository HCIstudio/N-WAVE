// Template engine that orchestrates all capability-specific templates

import {
  generateGenericProcess,
  type ProcessConfig,
} from "../templates/processes";

import { generateOutputDisplayProcess } from "../templates/outputs";
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
    default:
      return generateGenericProcess(config);
  }
}

export type FilterProcessConfig = Parameters<typeof generateFilterProcess>[0];
export type MapProcessConfig = Parameters<typeof generateMapProcess>[0];
export type MergeProcessConfig = Parameters<typeof generateMergeProcess>[0];
export type OutputDisplayConfig = Parameters<
  typeof generateOutputDisplayProcess
>[0];

export function generateOperatorCode(
  operatorType: "filter",
  config: FilterProcessConfig
): string;
export function generateOperatorCode(
  operatorType: "map",
  config: MapProcessConfig
): string;
export function generateOperatorCode(
  operatorType: "merge",
  config: MergeProcessConfig
): string;
export function generateOperatorCode(
  operatorType: "filter" | "map" | "merge",
  config: FilterProcessConfig | MapProcessConfig | MergeProcessConfig
): string {
  // The overloads tie each operator type to its config shape.
  switch (operatorType) {
    case "filter":
      return generateFilterProcess(config as FilterProcessConfig);
    case "map":
      return generateMapProcess(config as MapProcessConfig);
    case "merge":
      return generateMergeProcess(config as MergeProcessConfig);
    default:
      throw new Error(`Unknown operator type: ${operatorType}`);
  }
}

export function generateOutputCode(config: OutputDisplayConfig): string {
  return generateOutputDisplayProcess(config);
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

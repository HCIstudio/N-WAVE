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

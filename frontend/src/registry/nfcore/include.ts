/** `include { STAR_ALIGN }`, or `include { STAR_ALIGN as STAR_ALIGN_2 }` when the step is named otherwise. */
export const includeFor = (processName: string, alias: string, path: string): string =>
  `include { ${processName}${alias === processName ? "" : ` as ${alias}`} } from '${path}'`;

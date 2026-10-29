const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

// Colours and styles in Nextflow's console output, and the links newer
// Nextflow versions put on task hashes (OSC 8, ended by BEL or ESC \).
const TERMINAL_CODES = new RegExp(
  `${ESC}\\[[0-9;?]*[A-Za-z]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
  "g",
);

/** The text a terminal would show, without its escape codes. */
export const stripTerminalCodes = (text: string): string =>
  text.replace(TERMINAL_CODES, "");

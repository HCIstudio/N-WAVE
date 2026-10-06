// Helper functions the generated scripts call. They are top-level script
// functions (not closures in each channel) so the scripts pass Nextflow's
// strict syntax (`nextflow lint`); each is emitted only when a script uses it.

/** Groovy condition: `item` is a `[meta, files...]` channel item. */
const HAS_META =
  "item instanceof List && item.size() > 1 && item[0] instanceof Map";

export const NWAVE_HELPER_FUNCTIONS: Record<string, string> = {
  // The files of a channel item, dropping a leading meta map.
  nwaveFilesOf: [
    "def nwaveFilesOf(item) {",
    `    ${HAS_META} ? (item.size() == 2 ? item[1] : item[1..-1]) : item`,
    "}",
  ].join("\n"),
  // The meta map of a channel item, or null.
  nwaveMetaOf: [
    "def nwaveMetaOf(item) {",
    `    ${HAS_META} ? item[0] : null`,
    "}",
  ].join("\n"),
  // An input file: absolute paths and URLs as they are, other paths in the
  // input directory.
  nwaveInputFile: [
    "def nwaveInputFile(path) {",
    '    file(path ==~ /^(\\/|[A-Za-z][A-Za-z0-9+.-]*:\\/\\/).*/ ? path : "${params.inputdir}/${path}", checkIfExists: true)',
    "}",
  ].join("\n"),
};

/** Definitions of the helper functions `code` calls. */
export const helperFunctionsFor = (code: string): string[] =>
  Object.entries(NWAVE_HELPER_FUNCTIONS)
    .filter(([name]) => new RegExp(`\\b${name}\\(`).test(code))
    .map(([, definition]) => definition);

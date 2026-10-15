/**
 * One line that says why a Nextflow run failed, for the run history.
 *
 * Nextflow reports a failure as `ERROR ~ <what>`, often followed by
 * `Caused by:` and the cause. A workflow's own `error()` prints only its
 * message, as the last line.
 */
export const summarizeFailure = (output: string): string | undefined => {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const errorAt = lines.findIndex((line) => line.startsWith("ERROR ~"));
  let summary: string | undefined;
  if (errorAt >= 0) {
    summary = (lines[errorAt] ?? "").replace(/^ERROR ~\s*/, "");
    const causeAt = lines.indexOf("Caused by:", errorAt);
    if (causeAt >= 0 && lines[causeAt + 1]) {
      summary = `${summary}: ${lines[causeAt + 1]}`;
    }
  } else {
    summary = lines.pop();
  }
  return summary?.slice(0, 300) || undefined;
};

/**
 * Turns a growing text (a streamed response read so far) into complete
 * lines, each passed to `onLine` once. `feed` takes the whole text received
 * so far; `flush` also emits a final line without a line break.
 */
export const createLineReader = (onLine: (line: string) => void) => {
  let consumed = 0;
  const emit = (text: string, final: boolean) => {
    const end = final ? text.length : text.lastIndexOf("\n") + 1;
    if (end <= consumed) return;
    const chunk = text.slice(consumed, end);
    consumed = end;
    for (const line of chunk.split("\n")) {
      if (line.trim()) onLine(line.replace(/\r$/, ""));
    }
  };
  return {
    feed: (text: string) => emit(text, false),
    flush: (text: string) => emit(text, true),
  };
};

/** The backend's run id line: "N-WAVE run: <id>". */
export const parseRunId = (line: string): string | null =>
  line.match(/^N-WAVE run: (\S+)$/)?.[1] ?? null;

/** The backend's explanation when a run hit its resource or time limits. */
export const findResourceProblem = (output: string): string | null =>
  output.match(/^N-WAVE resource problem: (.+)$/m)?.[1]?.trim() ?? null;

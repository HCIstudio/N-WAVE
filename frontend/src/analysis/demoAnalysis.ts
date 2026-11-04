// The browser demo has no server to analyse on: its built-in examples were
// analysed when the demo was built (scripts/record-demo-analysis.sh), and
// their results are looked up by the script they generate.

/**
 * What identifies a script's analysis: the script without its first line
 * (the workflow's name), so a copy of a built-in example matches too.
 */
export const analysisKeyText = (script: string): string =>
  script.slice(script.indexOf("\n") + 1);

export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const DEMO_NOT_RECORDED =
  "In the browser demo, only the built-in examples can be analysed, as they come (they were analysed when the demo was built). Install N-WAVE to check your own workflows' code.";

// The colors of a branch's arms, shared by the Branch node's exits, the
// lanes around the arms' steps, and the lines to them: "if" green, each
// "else if" its own (sky, indigo, teal, in turn), "else" amber.

export interface ArmStyle {
  /** The lines' color. */
  line: string;
  /** The lane: its border and fill. */
  lane: string;
  /** Text in the arm's color. */
  text: string;
}

const IF: ArmStyle = { line: "#059669", lane: "border-emerald-500/70 bg-emerald-500/5", text: "text-emerald-700" };
const ELSE: ArmStyle = { line: "#d97706", lane: "border-amber-500/70 bg-amber-500/5", text: "text-amber-700" };
const ELSE_IFS: ArmStyle[] = [
  { line: "#0284c7", lane: "border-sky-500/70 bg-sky-500/5", text: "text-sky-700" },
  { line: "#4f46e5", lane: "border-indigo-500/70 bg-indigo-500/5", text: "text-indigo-700" },
  { line: "#0d9488", lane: "border-teal-500/70 bg-teal-500/5", text: "text-teal-700" },
];

export const armStyle = (arm: string): ArmStyle => {
  if (arm === "if") return IF;
  if (arm === "else") return ELSE;
  const index = Number(arm.slice("else-if-".length)) || 1;
  return ELSE_IFS[(index - 1) % ELSE_IFS.length];
};

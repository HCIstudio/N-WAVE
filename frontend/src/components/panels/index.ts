// Base panel components
export * from "./base";

// Process panel components
export * from "./process";

// Input panel components
export * from "./input";

// Output panel components
export * from "./output";

// Operator panel components
export * from "./operator";

// Note: Individual exports are available through the wildcard exports above
// This approach avoids circular references while maintaining full export capability

// Panel categories for dynamic loading
export const PANEL_CATEGORIES = {
  BASE: "base",
  PROCESS: "process",
  INPUT: "input",
  OUTPUT: "output",
  OPERATOR: "operator",
  SHARED: "shared",
} as const;

export type PanelCategory =
  (typeof PANEL_CATEGORIES)[keyof typeof PANEL_CATEGORIES];

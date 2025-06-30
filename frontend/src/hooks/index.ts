// Execution hooks
export * from "./execution";

// Operator hooks
export * from "./operator";

// UI hooks
export * from "./ui";

// Workflow hooks
export * from "./workflow";

// Hook categories for dynamic loading
export const HOOK_CATEGORIES = {
  EXECUTION: "execution",
  OPERATOR: "operator",
  UI: "ui",
  WORKFLOW: "workflow",
} as const;

export type HookCategory =
  (typeof HOOK_CATEGORIES)[keyof typeof HOOK_CATEGORIES];

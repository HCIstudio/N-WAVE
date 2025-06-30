// UI Components - Basic reusable UI elements
export * from "./ui";

// Form Components - Input fields and form-related components
export * from "./forms";

// Dialog Components - Modal dialogs and confirmations
export * from "./dialogs";

// Data Components - Data viewing and display components
export * from "./data";

// Workflow Components - Workflow-specific complex components
export * from "./workflow";

// Component categories for organization
export const COMMON_COMPONENT_CATEGORIES = {
  UI: "ui",
  FORMS: "forms",
  DIALOGS: "dialogs",
  DATA: "data",
  WORKFLOW: "workflow",
} as const;

export type CommonComponentCategory =
  (typeof COMMON_COMPONENT_CATEGORIES)[keyof typeof COMMON_COMPONENT_CATEGORIES];

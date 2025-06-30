// Core script generation
export * from "./core";

// Template system
export * from "./templates";

// Execution capabilities
export * from "./execution";

// Validation (future)
export * from "./validation";

// Generator categories for organization
export const GENERATOR_CATEGORIES = {
  CORE: "core",
  TEMPLATES: "templates",
  EXECUTION: "execution",
  VALIDATION: "validation",
} as const;

export type GeneratorCategory =
  (typeof GENERATOR_CATEGORIES)[keyof typeof GENERATOR_CATEGORIES];

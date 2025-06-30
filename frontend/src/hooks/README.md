# N-WAVE Frontend Hooks Documentation

> This documentation applies to the N-WAVE frontend. For overall project features, contribution guidelines, and license, see the main backend README.

# Hooks Directory Structure

This directory contains all custom React hooks used in the Nextflow Interface, organized into a scalable and reusable structure.

## Directory Structure

```
hooks/
├── execution/                     # Execution-related hooks
│   ├── useExecutionStatus.ts      # Hook for tracking workflow execution status
│   └── index.ts                   # Execution hooks exports
├── operator/                      # Operator-specific hooks
│   ├── useFilterOperator.ts       # Filter operator logic hook
│   ├── useMapOperator.ts          # Map operator logic hook
│   ├── useReduceOperator.ts       # Reduce operator logic hook
│   ├── useOperatorLogic.ts        # Base operator logic hook
│   ├── useProcessOperatorLogic.ts # Process operator logic hook
│   ├── operatorRegistry.ts        # Operator registry and utilities
│   └── index.ts                   # Operator hooks exports
├── ui/                            # UI-related hooks
│   ├── useOperatorPanel.ts        # Hook for operator panel functionality
│   └── index.ts                   # UI hooks exports
├── workflow/                      # Workflow-related hooks
│   └── index.ts                   # Workflow hooks exports (placeholder)
├── index.ts                       # Centralized exports for entire module
└── README.md                      # This documentation file
```

## Design Principles

### 1. Category-Based Organization

- **Execution**: Hooks that manage workflow execution lifecycle, progress tracking, and status monitoring.
- **Operator**: Hooks specific to operator node logic (filter, map, reduce operations)
- **UI**: Hooks that manage UI state, panel interactions, and user interface logic
- **Workflow**: Hooks for workflow-level state management, validation, and lifecycle

### 2. Scalable Hook Structure

- Each directory has its own index.ts for organized exports
- Hooks are grouped by functionality for easy maintenance
- Clear separation of concerns between different hook types
- Consistent naming conventions (use[Category][Function])

### 3. Import/Export Strategy

- Centralized exports through index.ts files at every level
- Main index.ts provides all exports for the entire module
- Individual category imports available (e.g., `import { useExecutionStatus } from '@/hooks/execution'`)
- Full module imports available (e.g., `import { useExecutionStatus } from '@/hooks'`)

## Hook Categories

### Execution Hooks

**Purpose**: Manage workflow execution lifecycle, progress tracking, and status monitoring.

- `useExecutionStatus`: Comprehensive hook for tracking workflow execution
  - Monitors execution progress and node statuses
  - Handles execution cancellation and completion
  - Parses Nextflow output and updates UI accordingly
  - Manages execution timers and progress intervals

### Operator Hooks

**Purpose**: Provide logic for data transformation operators used in workflows.

- `useFilterOperator`: Handles file filtering operations
  - Filters files based on text patterns, regex, or custom logic
  - Supports multiple filter modes (contains, startsWith, endsWith, matches)
  - Manages selected files state and filter negation
- `useMapOperator`: Handles data transformation operations
  - Maps and transforms file content or metadata
  - Provides transformation utilities and state management
- `useReduceOperator`: Handles data aggregation operations
  - Reduces multiple files or data points to single values
  - Manages aggregation logic and state
- `useOperatorLogic`: Base hook for common operator functionality
  - Shared logic for all operator types
  - Common state management and utilities
- `useProcessOperatorLogic`: Handles operator processing logic
  - Manages operator data flow and processing
  - Coordinates between different operator types
- `operatorRegistry`: Registry and utilities for operator management
  - Operator type definitions and registrations
  - Utility functions for operator handling

### UI Hooks

**Purpose**: Manage user interface state, interactions, and panel functionality.

- `useOperatorPanel`: Manages operator panel functionality
  - Handles incoming file detection and processing
  - Provides utilities for operator panel data management
  - Manages panel state and interactions

### Workflow Hooks

**Purpose**: Workflow-level state management and lifecycle hooks (future expansion).

_Currently empty - reserved for future workflow management hooks such as:_

- `useWorkflowState`: Global workflow state management
- `useWorkflowValidation`: Workflow validation and error checking
- `useWorkflowPersistence`: Workflow saving and loading functionality

## Usage Examples

### Importing Specific Hooks

```tsx
// Import from specific categories
import { useExecutionStatus } from "@/hooks/execution";
import { useFilterOperator, useMapOperator } from "@/hooks/operator";
import { useOperatorPanel } from "@/hooks/ui";

// Import from main module
import {
  useExecutionStatus,
  useFilterOperator,
  useOperatorPanel,
} from "@/hooks";
```

### Using Execution Hooks

```tsx
const MyComponent = () => {
  const executionStatus = useExecutionStatus({
    nodes: workflowNodes,
    executionId: currentExecutionId,
    onStatusChange: (status) => {
      console.log("Execution status changed:", status);
    },
  });

  return (
    <div>
      {executionStatus.isVisible && (
        <ExecutionPanel
          status={executionStatus.status}
          onCancel={executionStatus.cancelExecution}
          onHide={executionStatus.hideStatus}
        />
      )}
    </div>
  );
};
```

### Using Operator Hooks

```tsx
const FilterPanel = ({ node, onSave }) => {
  const { incomingFiles } = useOperatorPanel(node, onSave);

  const { selectedFiles, setSelectedFiles } = useFilterOperator(
    incomingFiles,
    node.data,
    (data) => onSave(node.id, data)
  );

  return (
    <div>
      <FileSelector
        files={incomingFiles}
        selectedFiles={selectedFiles}
        onSelectionChange={setSelectedFiles}
      />
    </div>
  );
};
```

### Adding New Hooks

1. **Determine the appropriate category** (execution, operator, ui, workflow)
2. **Create the hook** in the appropriate directory
3. **Add export** to the directory's index.ts file
4. **The main index.ts** will automatically include it through wildcard exports

Example - Adding a new workflow hook:

```tsx
// 1. Create: frontend/src/hooks/workflow/useWorkflowValidation.ts
export const useWorkflowValidation = (nodes: Node[], edges: Edge[]) => {
  // Hook implementation
  return {
    isValid,
    errors,
    validate,
  };
};

// 2. Update: frontend/src/hooks/workflow/index.ts
export { useWorkflowValidation } from "./useWorkflowValidation";
export type * from "./useWorkflowValidation";

// 3. The hook is now available as:
import { useWorkflowValidation } from "@/hooks";
```

## Hook Categories

The module exports `HOOK_CATEGORIES` constant for dynamic hook organization:

```tsx
import { HOOK_CATEGORIES, type HookCategory } from "@/hooks";

// Usage in dynamic organization
const getHooksByCategory = (category: HookCategory) => {
  switch (category) {
    case HOOK_CATEGORIES.EXECUTION:
      return ExecutionHooks;
    case HOOK_CATEGORIES.OPERATOR:
      return OperatorHooks;
    case HOOK_CATEGORIES.UI:
      return UIHooks;
    case HOOK_CATEGORIES.WORKFLOW:
      return WorkflowHooks;
  }
};
```

## Migration Guide

### From Root-Level Imports

**Before:**

```tsx
import { useExecutionStatus } from "@/hooks/useExecutionStatus";
import { useFilterOperator } from "@/hooks/operator-hooks/useFilterOperator";
```

**After:**

```tsx
// Option 1: Category-specific imports
import { useExecutionStatus } from "@/hooks/execution";
import { useFilterOperator } from "@/hooks/operator";

// Option 2: Main module imports
import { useExecutionStatus, useFilterOperator } from "@/hooks";
```

### File Locations

Update any direct file path imports:

- `@/hooks/useExecutionStatus` → `@/hooks/execution/useExecutionStatus`
- `@/hooks/operator-hooks/useFilterOperator` → `@/hooks/operator/useFilterOperator`
- `@/hooks/useOperatorPanel` → `@/hooks/ui/useOperatorPanel`

## Benefits of This Structure

1. **Better Organization**: Related hooks are grouped together
2. **Scalability**: Easy to add new hooks without cluttering the root directory
3. **Reusability**: Clear categorization makes hooks easier to find and reuse
4. **Maintainability**: Clear separation of concerns and consistent patterns
5. **Developer Experience**: Intuitive structure and centralized exports
6. **Type Safety**: Full TypeScript support with proper type exports
7. **Performance**: Better tree shaking through organized exports

## Future Enhancements

1. **Workflow Hooks**: Complete implementation of workflow management hooks
2. **Testing Structure**: Organized test files following the same directory structure
3. **Hook Composition**: Utilities for composing multiple hooks together
4. **Performance Hooks**: Hooks for monitoring and optimizing performance
5. **Data Fetching**: Hooks for API interactions and data management
6. **State Management**: Advanced state management hooks for complex workflows

This structure provides a solid foundation for scaling the hook system while maintaining clean, organized, and reusable code.

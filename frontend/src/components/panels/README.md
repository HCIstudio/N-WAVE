# N-WAVE Frontend Panels Documentation

> This documentation applies to the N-WAVE frontend. For overall project features, contribution guidelines, and license, see the main backend README.

# Panels Directory Structure

This directory contains all panel components used in the Nextflow Interface, organized into a scalable and reusable structure.

## Directory Structure

```
panels/
├── base/                          # Foundation panel components
│   ├── PropertiesPanel.tsx        # Main properties panel wrapper
│   ├── FloatingPanel.tsx          # Floating panel base component
│   └── index.ts                   # Base exports
├── process/                       # Process-specific panels
│   ├── FastQCPanel.tsx            # FastQC configuration panel
│   ├── TrimmomaticPanel.tsx       # Trimmomatic configuration panel
│   ├── ProcessNodePanel.tsx       # Generic process node panel
│   └── index.ts                   # Process exports
├── input/                         # Input-related panels
│   ├── FileInputPanel.tsx         # File input configuration panel
│   └── index.ts                   # Input exports
├── output/                        # Output-related panels
│   ├── OutputDisplayPanelContent.tsx  # Output display panel content
│   └── index.ts                   # Output exports
├── operator/                      # Operator-related panels
│   ├── OperatorNodePanel.tsx      # Generic operator panel
│   ├── BaseOperatorPanel.tsx      # Base operator panel component
│   ├── FilterPanel.tsx            # Filter operator panel
│   ├── MapPanel.tsx               # Map operator panel
│   ├── ReducePanel.tsx            # Reduce operator panel
│   └── index.ts                   # Operator exports
├── shared/                        # Reusable components across panels
│   └── index.ts                   # Shared exports (placeholder for future components)
├── index.ts                       # Centralized exports for entire module
└── README.md                      # This documentation file
```

## Design Principles

### 1. Category-Based Organization

- **Base**: Foundation components that provide common functionality
- **Process**: Panels specific to Nextflow processes (FastQC, Trimmomatic, etc.)
- **Input**: Panels for configuring input nodes (file inputs, parameters, etc.)
- **Output**: Panels for configuring output nodes (displays, publishing, etc.)
- **Operator**: Panels for operator nodes (filter, map, reduce, etc.)
- **Shared**: Reusable components that can be used across different panel types

### 2. Scalable Component Structure

- Each directory has its own index.ts for organized exports
- Components are grouped by functionality for easy maintenance
- Clear separation of concerns between different panel types
- Consistent naming conventions across all panels

### 3. Import/Export Strategy

- Centralized exports through index.ts files at every level
- Main index.ts provides all exports for the entire module
- Individual category imports available (e.g., `import { FastQCPanel } from '@/components/panels/process'`)
- Full module imports available (e.g., `import { FastQCPanel } from '@/components/panels'`)

## Usage Examples

### Importing Specific Components

```tsx
// Import from specific categories
import { FastQCPanel, TrimmomaticPanel } from "@/components/panels/process";
import { FileInputPanel } from "@/components/panels/input";
import { FilterPanel, MapPanel } from "@/components/panels/operator";

// Import from main module
import {
  FastQCPanel,
  FileInputPanel,
  PropertiesPanel,
  DocumentationPanelContent,
} from "@/components/panels";
```

### Adding New Panels

1. **Determine the appropriate category** (base, process, input, output, operator, shared)
2. **Create the component** in the appropriate directory
3. **Add export** to the directory's index.ts file
4. **The main index.ts** will automatically include it through wildcard exports

Example - Adding a new process panel:

```tsx
// 1. Create: frontend/src/components/panels/process/STARPanel.tsx
const STARPanel: React.FC<ProcessPanelProps> = ({ node, onSave }) => {
  // Panel implementation
};

export default STARPanel;

// 2. Update: frontend/src/components/panels/process/index.ts
export { default as STARPanel } from "./STARPanel";
export type * from "./STARPanel";

// 3. The component is now available as:
import { STARPanel } from "@/components/panels";
```

## Panel Categories

The module exports `PANEL_CATEGORIES` constant for dynamic panel loading:

```tsx
import { PANEL_CATEGORIES, type PanelCategory } from "@/components/panels";

// Usage in dynamic loading
const getPanelComponent = (category: PanelCategory) => {
  switch (category) {
    case PANEL_CATEGORIES.PROCESS:
      return ProcessPanels;
    case PANEL_CATEGORIES.INPUT:
      return InputPanels;
    case PANEL_CATEGORIES.OPERATOR:
      return OperatorPanels;
    // etc.
  }
};
```

## Migration Guide

### From Root-Level Imports

**Before:**

```tsx
import FastQCPanel from "@/components/panels/FastQCPanel";
import FileInputPanel from "@/components/panels/FileInputPanel";
```

**After:**

```tsx
// Option 1: Category-specific imports
import { FastQCPanel } from "@/components/panels/process";
import { FileInputPanel } from "@/components/panels/input";

// Option 2: Main module imports
import { FastQCPanel, FileInputPanel } from "@/components/panels";
```

### File Locations

Update any direct file path imports:

- `@/components/panels/FastQCPanel` → `@/components/panels/process/FastQCPanel`
- `@/components/panels/FileInputPanel` → `@/components/panels/input/FileInputPanel`
- etc.

## Benefits of This Structure

1. **Better Organization**: Related panels are grouped together
2. **Scalability**: Easy to add new panels without cluttering the root directory
3. **Reusability**: Shared components are clearly identified and accessible
4. **Maintainability**: Clear separation of concerns and consistent patterns
5. **Developer Experience**: Intuitive structure and centralized exports
6. **Tree Shaking**: Better bundling optimization through organized exports
7. **Type Safety**: Full TypeScript support with proper type exports

## Future Enhancements

1. **Base Panel Classes**: Create abstract base panels for each category with common functionality
2. **Panel Registry**: Dynamic panel discovery and loading system
3. **Shared Component Library**: Expand shared components for common UI patterns
4. **Documentation Generation**: Automatic documentation from component props
5. **Testing Structure**: Organized test files following the same directory structure

This structure provides a solid foundation for scaling the panel system while maintaining clean, organized, and reusable code.

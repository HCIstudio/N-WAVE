# N-WAVE Frontend Generators Documentation

> This documentation applies to the N-WAVE frontend. For overall project features, contribution guidelines, and license, see the main backend README.

# Nextflow Script Generators

This module provides a comprehensive, organized system for generating Nextflow scripts from visual workflow representations. The module has been refactored from scattered utilities into a cohesive, scalable architecture.

## Directory Structure

```
generators/
├── core/                    # Core script generation logic
│   ├── generateNextflowScript.ts  # Main script generator
│   ├── templateEngine.ts          # Template orchestration
│   └── index.ts                   # Core exports
├── templates/               # Template modules for different node types
│   ├── processes.ts                # Process templates (FastQC, Trimmomatic, etc.)
│   ├── operators.ts               # Operator templates (Filter, Map, Reduce)
│   ├── inputs.ts                  # Input channel templates
│   ├── outputs.ts                 # Output and display templates
│   └── index.ts                   # Template exports
├── execution/              # Execution capabilities and validation
│   ├── executionCapabilities.ts  # System detection and validation
│   └── index.ts                  # Execution exports
├── validation/             # Script validation (future expansion)
│   └── index.ts                  # Validation exports (placeholder)
├── index.ts                # Main module exports
└── README.md              # This documentation
```

## Module Categories

### Core (`./core/`)

**Purpose**: Central script generation logic and template orchestration.

**Key Components**:

- `generateNextflowScript()`: Main function that converts React Flow nodes/edges to Nextflow script
- `templateEngine`: Orchestrates template generation for different node types
- **Template Functions**:
  - `generateProcessCode()`: Creates process definitions
  - `generateOperatorCode()`: Creates operator logic
  - `generateOutputCode()`: Creates output handling

### Templates (`./templates/`)

**Purpose**: Specialized template generators for different Nextflow constructs.

**Key Components**:

- `processes.ts`: Templates for computational processes
  - FastQC quality control
  - Trimmomatic read trimming
  - Generic containerized processes
- `operators.ts`: Templates for data flow operators
  - Filter operations
  - Map transformations
  - Reduce aggregations
- `inputs.ts`: Templates for input channels
  - File input handling
  - Value inputs
  - Parameter definitions
- `outputs.ts`: Templates for output handling
  - File publishing
  - Display formatting
  - Result saving

### Execution (`./execution/`)

**Purpose**: System capability detection and execution validation.

**Key Components**:

- `ExecutionCapabilityDetector`: Detects Docker/Nextflow availability
- `ExecutionSettingsValidator`: Validates execution configurations
- `ExecutionModeHelper`: Provides execution mode recommendations

### Validation (`./validation/`)

**Purpose**: Script-specific validation (future expansion).

**Planned Components**:

- Script syntax validation
- Dependency checking
- Resource requirement validation
- Workflow logic validation

## Usage Examples

### Basic Script Generation

```typescript
import { generateNextflowScript } from "@/generators";

// Convert React Flow workflow to Nextflow script
const script = generateNextflowScript(nodes, edges, "My Workflow");
```

### Using Templates Directly

```typescript
import { generateProcessCode, generateOperatorCode } from "@/generators/core";

// Generate FastQC process
const fastqcProcess = generateProcessCode("fastqc", {
  processName: "quality_control",
  cpuCount: 4,
  memoryAmount: "4.GB",
  fastqcOptions: "--threads 4",
});

// Generate filter operator
const filterOperator = generateOperatorCode("filter", {
  processName: "filter_files",
  cpuCount: 1,
  memoryAmount: "2.GB",
  containerImage: "ubuntu:22.04",
  filterText: ".fastq",
  filterMode: "contains",
  filterNegate: false,
});
```

### Execution Capabilities

```typescript
import {
  capabilityDetector,
  settingsValidator,
  ExecutionModeHelper,
} from "@/generators/execution";

// Detect system capabilities
const capabilities = await capabilityDetector.getCapabilities();

// Get execution recommendations
const recommendations = await capabilityDetector.getExecutionRecommendations();

// Validate execution settings
const validation = await settingsValidator.validateSettings(settings);

// Check execution mode feasibility
const isFeasible = await ExecutionModeHelper.isExecutionModeFeasible(mode);
```

### Template System Access

```typescript
import {
  generateFastQCProcess,
  generateFilterOperator,
  generateOutputDisplayProcess,
} from "@/generators/templates";

// Direct template access for advanced use cases
const customProcess = generateFastQCProcess({
  processName: "custom_fastqc",
  cpuCount: 8,
  memoryAmount: "16.GB",
  fastqcOptions: "--threads 8 --nogroup",
});
```

## Design Principles

### 1. Template-Based Generation

- **Clean Code**: No complex inline string building
- **Error Prevention**: Templates handle escaping and syntax
- **Maintainability**: Templates can be updated independently
- **Reusability**: Templates can be used across different contexts

### 2. Modular Architecture

- **Separation of Concerns**: Core logic, templates, execution, validation
- **Scalability**: Easy to add new node types and capabilities
- **Testability**: Each module can be tested independently
- **Maintainability**: Clear organization reduces complexity

### 3. Progressive Enhancement

- **Core Functionality**: Basic script generation works immediately
- **Advanced Features**: Execution detection and validation enhance user experience
- **Future Expansion**: Structure supports additional features without refactoring

### 4. Type Safety

- **Strong Typing**: All templates use TypeScript interfaces
- **Configuration Objects**: Structured data prevents parameter errors
- **Export Consistency**: Consistent type exports across modules

## Generator Categories

```typescript
export const GENERATOR_CATEGORIES = {
  CORE: "core",
  TEMPLATES: "templates",
  EXECUTION: "execution",
  VALIDATION: "validation",
} as const;
```

## Migration Guide

### From Previous Structure

**Before** (scattered in utils/templates):

```typescript
import { generateNextflowScript } from "../utils/generateNextflowScript";
import { templateEngine } from "../utils/templateEngine";
import { capabilityDetector } from "../utils/executionCapabilities";
```

**After** (organized generators):

```typescript
import {
  generateNextflowScript,
  templateEngine,
  capabilityDetector,
} from "../generators";
```

### Import Patterns

```typescript
// Option 1: Main module imports (recommended)
import {
  generateNextflowScript,
  capabilityDetector,
  settingsValidator,
} from "@/generators";

// Option 2: Category-specific imports
import { generateNextflowScript } from "@/generators/core";
import { capabilityDetector } from "@/generators/execution";
import { generateFastQCProcess } from "@/generators/templates";

// Option 3: Specific template imports
import {
  generateProcessCode,
  generateOperatorCode,
} from "@/generators/core/templateEngine";
```

## Benefits of Refactoring

### Organization

- **Clear Structure**: Logical grouping of related functionality
- **Easy Navigation**: Find components quickly
- **Consistent Patterns**: Similar organization to panels and hooks

### Maintainability

- **Single Responsibility**: Each module has a focused purpose
- **Reduced Coupling**: Clear interfaces between modules
- **Error Isolation**: Issues contained within specific modules

### Scalability

- **Easy Expansion**: Add new templates or capabilities without affecting others
- **Plugin Architecture**: Templates can be developed independently
- **Version Management**: Individual modules can be versioned separately

### Developer Experience

- **Intuitive Imports**: Clear, discoverable import paths
- **Type Safety**: Strong typing prevents runtime errors
- **Documentation**: Comprehensive documentation and examples

## Future Enhancements

### Validation Module

- **Syntax Validation**: Real-time Nextflow syntax checking
- **Dependency Analysis**: Detect missing dependencies
- **Resource Optimization**: Suggest resource improvements
- **Best Practices**: Automated code quality checks

### Template Extensions

- **Custom Templates**: User-defined process templates
- **Template Sharing**: Community template repository
- **Version Control**: Template versioning and compatibility
- **Performance Optimization**: Template caching and optimization

### Advanced Generation

- **Workflow Optimization**: Automatic parallelization suggestions
- **Error Recovery**: Robust error handling and recovery
- **Multi-target Support**: Generate for different Nextflow versions
- **Configuration Management**: Advanced configuration templating

## Testing Strategy

### Unit Tests

- Template generation accuracy
- Configuration validation
- Type safety verification
- Error handling coverage

### Integration Tests

- End-to-end script generation
- Template orchestration
- Execution capability detection
- Settings validation workflows

### Performance Tests

- Large workflow generation
- Template caching efficiency
- Memory usage optimization
- Generation speed benchmarks

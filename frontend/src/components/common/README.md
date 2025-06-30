# N-WAVE Frontend Common Components Documentation

> This documentation applies to the N-WAVE frontend. For overall project features, contribution guidelines, and license, see the main backend README.

# Common Components

This module provides reusable UI components organized by functionality and purpose. The module has been refactored from a flat structure into logical categories for better organization and maintainability.

## Directory Structure

```
common/
├── ui/                     # Basic UI components
│   ├── Panel.tsx              # Collapsible panel container
│   ├── LoadingIndicator.tsx   # Loading spinner component
│   ├── DynamicIcon.tsx        # Dynamic icon renderer
│   ├── Toast.tsx              # Toast notification component
│   └── index.ts               # UI component exports
├── forms/                  # Form input and interaction components
│   ├── FileInput.tsx           # File selection input
│   ├── SearchInput.tsx         # Search input with filtering
│   ├── InlineEdit.tsx          # Inline text editing
│   ├── FormComponents.tsx      # Form field components
│   ├── ProcessDropdown.tsx     # Process selection dropdown
│   └── index.ts                # Form component exports
├── dialogs/               # Modal dialogs and confirmations
│   ├── Modal.tsx               # Base modal component
│   ├── ActionDialog.tsx        # Action confirmation dialog
│   ├── ConfirmationDialog.tsx  # Generic confirmation dialog
│   ├── ConfirmDialog.tsx       # Simple confirm/cancel dialog
│   └── index.ts                # Dialog component exports
├── data/                  # Data viewing and display components
│   ├── FileViewer.tsx          # Multi-format file viewer
│   ├── CsvViewer.tsx           # CSV data table viewer
│   ├── JsonViewer.tsx          # JSON structure viewer
│   └── index.ts                # Data component exports
├── workflow/              # Workflow-specific complex components
│   ├── DockerSettings.tsx      # Docker execution settings
│   ├── WorkflowExecutionErrorNotification.tsx # Error notifications
│   └── index.ts                # Workflow component exports
├── index.ts               # Main module exports
└── README.md              # This documentation
```

## Component Categories

### UI Components (`./ui/`)

**Purpose**: Basic, reusable UI elements that provide fundamental interface functionality.

**Key Components**:

- `Panel`: Collapsible container with header and content sections
- `LoadingIndicator`: Spinner component for loading states
- `DynamicIcon`: Renders icons dynamically based on string names
- `Toast`: Non-blocking notification messages

**Use Cases**:

- Building consistent layouts
- Providing user feedback
- Creating interactive containers
- Displaying status information

### Form Components (`./forms/`)

**Purpose**: Input fields, form controls, and user interaction components.

**Key Components**:

- `FileInput`: File selection with preview and validation
- `SearchInput`: Text input with search and filtering capabilities
- `InlineEdit`: Editable text with save/cancel functionality
- `FormComponents`: Reusable form field components (InputField, SelectField, etc.)
- `ProcessDropdown`: Specialized dropdown for process selection

**Use Cases**:

- Building configuration panels
- Creating data input forms
- Providing search functionality
- Enabling inline editing workflows

### Dialog Components (`./dialogs/`)

**Purpose**: Modal dialogs, confirmations, and overlay interfaces.

**Key Components**:

- `Modal`: Base modal component with backdrop and positioning
- `ActionDialog`: Confirmation dialog with custom action buttons
- `ConfirmationDialog`: Generic confirmation with customizable content
- `ConfirmDialog`: Simple yes/no confirmation dialog

**Use Cases**:

- Confirming destructive actions
- Displaying important information
- Creating wizard-like flows
- Gathering user confirmation

### Data Components (`./data/`)

**Purpose**: Components for viewing and displaying various data formats.

**Key Components**:

- `FileViewer`: Multi-format file viewer (FASTQ, FASTA, CSV, JSON, etc.)
- `CsvViewer`: Specialized CSV data table with pagination
- `JsonViewer`: Hierarchical JSON structure display
- `detectFileType`: Utility function for file type detection

**Use Cases**:

- Displaying file contents
- Previewing data before processing
- Viewing workflow outputs
- Data exploration and validation

### Workflow Components (`./workflow/`)

**Purpose**: Complex, workflow-specific components with business logic.

**Key Components**:

- `DockerSettings`: Comprehensive Docker execution configuration
- `WorkflowExecutionErrorNotification`: Detailed error display for workflow execution

**Use Cases**:

- Configuring execution environments
- Displaying execution errors
- Managing workflow settings
- Providing execution feedback

## Usage Examples

### Basic UI Components

```typescript
import { Panel, LoadingIndicator, Toast } from "@/components/common";

// Collapsible panel
<Panel title="Configuration" collapsible>
  <div>Panel content goes here</div>
</Panel>;

// Loading state
{
  isLoading && <LoadingIndicator />;
}

// Notification
<Toast message="Save successful!" type="success" />;
```

### Form Components

```typescript
import {
  SearchInput,
  InlineEdit,
  SelectField,
  InputField
} from '@/components/common';

// Search with filtering
<SearchInput
  value={searchTerm}
  onChange={setSearchTerm}
  placeholder="Search files..."
  onClear={() => setSearchTerm('')}
/>

// Inline editing
<InlineEdit
  value={nodeData.name}
  onSave={(newValue) => updateNode({ name: newValue })}
  placeholder="Enter node name"
/>

// Form fields
<SelectField
  label="Execution Mode"
  value={mode}
  onChange={setMode}
  options={[
    { value: 'local', label: 'Local' },
    { value: 'docker', label: 'Docker' }
  ]}
/>
```

### Dialog Components

```typescript
import { ConfirmDialog, ActionDialog, Modal } from '@/components/common';

// Simple confirmation
<ConfirmDialog
  isOpen={showDeleteConfirm}
  onConfirm={handleDelete}
  onCancel={() => setShowDeleteConfirm(false)}
  title="Delete Workflow"
  message="Are you sure you want to delete this workflow?"
/>

// Custom action dialog
<ActionDialog
  isOpen={showActions}
  onClose={() => setShowActions(false)}
  title="Workflow Actions"
  actions={[
    { label: 'Save', onClick: handleSave, variant: 'primary' },
    { label: 'Export', onClick: handleExport, variant: 'secondary' }
  ]}
/>
```

### Data Components

```typescript
import { FileViewer, CsvViewer, detectFileType } from '@/components/common';

// Multi-format file viewing
<FileViewer
  content={fileContent}
  fileName={fileName}
  fileType={detectFileType(fileName)}
/>

// CSV table display
<CsvViewer
  data={csvData}
  maxRows={100}
  searchable={true}
/>
```

### Workflow Components

```typescript
import { DockerSettings, WorkflowExecutionErrorNotification } from '@/components/common';

// Execution configuration
<DockerSettings
  settings={executionSettings}
  onSettingsChange={updateSettings}
  capabilities={systemCapabilities}
/>

// Error display
<WorkflowExecutionErrorNotification
  error={executionError}
  onRetry={retryExecution}
  onDismiss={() => setExecutionError(null)}
/>
```

## Design Principles

### 1. Category-Based Organization

- **Logical Grouping**: Components grouped by functionality and purpose
- **Easy Discovery**: Developers can quickly find relevant components
- **Consistent Patterns**: Similar organization to other modules (panels, hooks, generators)

### 2. Reusability and Composition

- **Single Responsibility**: Each component has a focused purpose
- **Composable Design**: Components work well together
- **Configurable Props**: Flexible configuration through props
- **Consistent Interfaces**: Similar prop patterns across components

### 3. Progressive Enhancement

- **Basic Functionality**: Core features work out of the box
- **Advanced Features**: Optional props for enhanced functionality
- **Accessibility**: ARIA labels and keyboard navigation
- **Responsive Design**: Components adapt to different screen sizes

### 4. Type Safety

- **TypeScript First**: All components use TypeScript
- **Proper Interfaces**: Clear prop type definitions
- **Generic Support**: Components support generic types where appropriate
- **Export Consistency**: Consistent type exports for external usage

## Component Categories

```typescript
export const COMMON_COMPONENT_CATEGORIES = {
  UI: "ui",
  FORMS: "forms",
  DIALOGS: "dialogs",
  DATA: "data",
  WORKFLOW: "workflow",
} as const;
```

## Migration Guide

### From Previous Structure

**Before** (flat structure):

```typescript
import Panel from "../components/common/Panel";
import ConfirmDialog from "../components/common/ConfirmDialog";
import FileViewer from "../components/common/FileViewer";
import { SelectField } from "../components/common/FormComponents";
```

**After** (organized structure):

```typescript
import {
  Panel,
  ConfirmDialog,
  FileViewer,
  SelectField,
} from "../components/common";
```

### Import Patterns

```typescript
// Option 1: Main module imports (recommended)
import {
  Panel,
  ConfirmDialog,
  FileViewer,
  SelectField,
} from "@/components/common";

// Option 2: Category-specific imports
import { Panel } from "@/components/common/ui";
import { ConfirmDialog } from "@/components/common/dialogs";
import { FileViewer } from "@/components/common/data";
import { SelectField } from "@/components/common/forms";

// Option 3: Direct component imports
import Panel from "@/components/common/ui/Panel";
import ConfirmDialog from "@/components/common/dialogs/ConfirmDialog";
```

## Benefits of Refactoring

### Organization

- **Clear Structure**: Components grouped by logical functionality
- **Easy Navigation**: Find components quickly based on purpose
- **Reduced Clutter**: No more flat directory with 19+ files
- **Consistent Patterns**: Matches organization of panels, hooks, and generators

### Maintainability

- **Focused Modules**: Each category has a specific responsibility
- **Isolated Changes**: Updates to one category don't affect others
- **Clear Dependencies**: Component relationships are more obvious
- **Better Testing**: Components can be tested by category

### Developer Experience

- **Intuitive Imports**: Clear, discoverable import paths
- **Auto-completion**: Better IDE support with organized exports
- **Documentation**: Category-specific documentation and examples
- **Reduced Bundle Size**: Tree-shaking works better with organized exports

### Scalability

- **Easy Expansion**: Add new components to appropriate categories
- **Plugin Architecture**: Categories can be developed independently
- **Version Management**: Categories can be versioned separately
- **Team Development**: Different teams can own different categories

## Future Enhancements

### New Component Categories

- **Navigation**: Breadcrumbs, tabs, sidebar components
- **Feedback**: Progress bars, status indicators, validation messages
- **Layout**: Grid systems, responsive containers, spacing utilities
- **Visualization**: Charts, graphs, data visualization components

### Component Improvements

- **Theming**: Consistent theme system across all components
- **Accessibility**: Enhanced screen reader support and keyboard navigation
- **Performance**: Lazy loading and optimization for large datasets
- **Internationalization**: Multi-language support for all text content

### Development Tools

- **Storybook**: Interactive component documentation and testing
- **Testing**: Comprehensive unit and integration tests
- **Performance Monitoring**: Component performance tracking
- **Usage Analytics**: Track component usage patterns

## Testing Strategy

### Unit Tests

- Component rendering
- Props validation
- Event handling
- State management

### Integration Tests

- Component interaction
- Form submission flows
- Dialog workflows
- Data display accuracy

### Accessibility Tests

- Screen reader compatibility
- Keyboard navigation
- Color contrast validation
- ARIA label correctness

### Performance Tests

- Rendering performance
- Memory usage
- Bundle size impact
- Lazy loading effectiveness

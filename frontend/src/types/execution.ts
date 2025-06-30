// Execution capability and environment types
export interface SystemCapabilities {
  docker: {
    available: boolean;
    version?: string;
    error?: string;
  };
  nextflow: {
    local: {
      available: boolean;
      version?: string;
      error?: string;
    };
    docker: {
      available: boolean;
      version?: string;
      error?: string;
    };
  };
  platform: "windows" | "linux" | "darwin";
  architecture: "x64" | "arm64" | "other";
}

// Execution modes and when to use them
export enum ExecutionMode {
  LOCAL = "local", // Use local Nextflow installation
  DOCKER = "docker", // Use Docker containers for processes
  HYBRID = "hybrid", // Mix of local and containerized
  FORCE_DOCKER = "force_docker", // Force all execution through Docker
}

// When to recommend each mode
export interface ExecutionModeRecommendation {
  mode: ExecutionMode;
  reason: string;
  requirements: string[];
  advantages: string[];
  disadvantages: string[];
}

// Nextflow version management
export interface NextflowVersion {
  version: string;
  isLatest: boolean;
  isRecommended: boolean;
  releaseDate: string;
  notes?: string;
  dockerImage: string;
}

// Container registry information
export interface ContainerRegistry {
  name: string;
  url: string;
  description: string;
  categories: string[];
  requiresAuth: boolean;
}

// Enhanced execution settings with validation
export interface ExecutionSettings {
  // Core execution mode
  mode: ExecutionMode;

  // Nextflow configuration
  nextflow: {
    version: string;
    forceVersion: boolean; // Override automatic version selection
    enableDsl2: boolean;
    enableTrace: boolean;
    enableTimeline: boolean;
    enableReport: boolean;
  };

  // Container configuration
  container: {
    enabled: boolean;
    defaultImage: string;
    registry: string;
    pullPolicy: "always" | "never" | "if-not-present";
    customRunOptions: string[];
  };

  // Resource allocation
  resources: {
    maxCpus: number;
    maxMemory: string;
    maxTime: string; // ISO 8601 duration format
    executor: "local" | "sge" | "slurm" | "aws" | "google";
    queue?: string;
  };

  // Output and publishing
  output: {
    directory: string;
    namingPattern: string;
    overwrite: boolean;
    keepWorkDir: boolean;
  };

  // Error handling and retry
  errorHandling: {
    strategy: "terminate" | "ignore" | "retry" | "finish";
    maxRetries: number;
    backoffStrategy: "exponential" | "linear" | "fixed";
    continueOnError: boolean;
  };

  // Environment and profiles
  environment: {
    profile: string;
    customParams: Record<string, any>;
    environmentVariables: Record<string, string>;
  };

  // Cleanup and maintenance
  cleanup: {
    onSuccess: boolean;
    onFailure: boolean;
    intermediateFiles: boolean;
    workDirectory: boolean;
  };

  // Validation and constraints
  validation: {
    requireContainer: boolean;
    allowMissingInputs: boolean;
    strictChannelTypes: boolean;
    enableTypeChecking: boolean;
  };
}

// Settings validation results
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  recommendations: ExecutionModeRecommendation[];
}

export interface ValidationError {
  field: keyof ExecutionSettings | string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ValidationWarning {
  field: keyof ExecutionSettings | string;
  message: string;
  suggestion?: string;
}

// Execution status and monitoring
export interface ExecutionStatus {
  id: string;
  workflowName: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startTime?: Date;
  endTime?: Date;
  progress: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
  logs: ExecutionLog[];
  settings: ExecutionSettings;
}

export interface ExecutionLog {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  source: "nextflow" | "docker" | "system";
  message: string;
  details?: any;
}

// Configuration profiles for different use cases
export interface ExecutionProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "development" | "production" | "testing" | "bioinformatics";
  settings: Partial<ExecutionSettings>;
  requirements: Partial<SystemCapabilities>;
  isDefault: boolean;
  isBuiltIn: boolean;
}

// Default execution profiles
export const EXECUTION_PROFILES: ExecutionProfile[] = [
  {
    id: "development",
    name: "Development",
    description: "Fast iteration with minimal resource usage",
    icon: "Code",
    category: "development",
    settings: {
      mode: ExecutionMode.LOCAL,
      resources: {
        maxCpus: 2,
        maxMemory: "4GB",
        maxTime: "PT30M", // 30 minutes
        executor: "local",
      },
      cleanup: {
        onSuccess: false,
        onFailure: false,
        intermediateFiles: false,
        workDirectory: false,
      },
    },
    requirements: {},
    isDefault: true,
    isBuiltIn: true,
  },
  {
    id: "production",
    name: "Production",
    description: "Maximum reproducibility with container isolation",
    icon: "Server",
    category: "production",
    settings: {
      mode: ExecutionMode.DOCKER,
      container: {
        enabled: true,
        defaultImage: "ubuntu:22.04",
        registry: "docker.io",
        pullPolicy: "if-not-present",
        customRunOptions: [],
      },
      resources: {
        maxCpus: 8,
        maxMemory: "16GB",
        maxTime: "PT2H", // 2 hours
        executor: "local",
      },
      cleanup: {
        onSuccess: true,
        onFailure: false,
        intermediateFiles: true,
        workDirectory: false,
      },
    },
    requirements: {},
    isDefault: false,
    isBuiltIn: true,
  },
  {
    id: "bioinformatics",
    name: "Bioinformatics",
    description: "Optimized for genomics and biological data analysis",
    icon: "Dna",
    category: "bioinformatics",
    settings: {
      mode: ExecutionMode.DOCKER,
      container: {
        enabled: true,
        defaultImage: "biocontainers/samtools:latest",
        registry: "quay.io",
        pullPolicy: "if-not-present",
        customRunOptions: [],
      },
      resources: {
        maxCpus: 16,
        maxMemory: "32GB",
        maxTime: "PT6H", // 6 hours
        executor: "local",
      },
      validation: {
        requireContainer: true,
        allowMissingInputs: false,
        strictChannelTypes: true,
        enableTypeChecking: true,
      },
    },
    requirements: {},
    isDefault: false,
    isBuiltIn: true,
  },
];

// Nextflow version recommendations
export const NEXTFLOW_VERSIONS: NextflowVersion[] = [
  {
    version: "24.04.4",
    isLatest: true,
    isRecommended: true,
    releaseDate: "2024-07-01",
    notes: "Latest stable release with improved container support",
    dockerImage: "nextflow/nextflow:24.04.4",
  },
  {
    version: "23.10.1",
    isLatest: false,
    isRecommended: true,
    releaseDate: "2024-01-15",
    notes: "Long-term support release",
    dockerImage: "nextflow/nextflow:23.10.1",
  },
  {
    version: "22.10.8",
    isLatest: false,
    isRecommended: false,
    releaseDate: "2023-06-01",
    notes: "Legacy compatibility",
    dockerImage: "nextflow/nextflow:22.10.8",
  },
];

// Container registries and their specialized images
export const CONTAINER_REGISTRIES: ContainerRegistry[] = [
  {
    name: "Docker Hub",
    url: "https://hub.docker.com",
    description: "Primary container registry with general-purpose images",
    categories: ["general", "programming", "databases"],
    requiresAuth: false,
  },
  {
    name: "BioContainers",
    url: "https://quay.io/organization/biocontainers",
    description: "Specialized bioinformatics and life science tools",
    categories: ["bioinformatics", "genomics", "proteomics"],
    requiresAuth: false,
  },
  {
    name: "Quay.io",
    url: "https://quay.io",
    description: "Enterprise container registry with security scanning",
    categories: ["enterprise", "security", "bioinformatics"],
    requiresAuth: false,
  },
  {
    name: "NVIDIA NGC",
    url: "https://ngc.nvidia.com",
    description: "GPU-accelerated containers for AI and HPC",
    categories: ["gpu", "ai", "hpc"],
    requiresAuth: true,
  },
];

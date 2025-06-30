import {
  ExecutionMode,
  NEXTFLOW_VERSIONS,
  type SystemCapabilities,
  type ExecutionModeRecommendation,
  type ExecutionSettings,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type NextflowVersion,
} from "../../types/execution";

/**
 * Detects system capabilities for Nextflow execution
 */
export class ExecutionCapabilityDetector {
  private capabilities: SystemCapabilities | null = null;
  private lastCheck: Date | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current system capabilities, with caching
   */
  async getCapabilities(forceRefresh = false): Promise<SystemCapabilities> {
    if (!forceRefresh && this.capabilities && this.lastCheck) {
      const age = Date.now() - this.lastCheck.getTime();
      if (age < this.CACHE_DURATION) {
        return this.capabilities;
      }
    }

    this.capabilities = await this.detectCapabilities();
    this.lastCheck = new Date();
    return this.capabilities;
  }

  /**
   * Detect all system capabilities
   */
  private async detectCapabilities(): Promise<SystemCapabilities> {
    const [dockerCapability, nextflowCapability, platformInfo] =
      await Promise.all([
        this.checkDockerCapability(),
        this.checkNextflowCapability(),
        this.getPlatformInfo(),
      ]);

    return {
      docker: dockerCapability,
      nextflow: nextflowCapability,
      platform: platformInfo.platform,
      architecture: platformInfo.architecture,
    };
  }

  /**
   * Check Docker availability and version
   */
  private async checkDockerCapability(): Promise<SystemCapabilities["docker"]> {
    try {
      const response = await fetch("/api/execute/docker-status");
      const data = await response.json();

      return {
        available: data.dockerAvailable || false,
        version: data.version,
        error: data.error,
      };
    } catch (error) {
      return {
        available: false,
        error: `Failed to check Docker status: ${error}`,
      };
    }
  }

  /**
   * Check Nextflow availability (local and Docker)
   */
  private async checkNextflowCapability(): Promise<
    SystemCapabilities["nextflow"]
  > {
    try {
      const response = await fetch("/api/execute/nextflow-status");
      const data = await response.json();

      return {
        local: {
          available: data.nextflowAvailable || false,
          version: data.version,
          error: data.error,
        },
        docker: {
          available: data.dockerNextflowAvailable || false,
          version: data.dockerVersion,
          error: data.dockerError,
        },
      };
    } catch (error) {
      return {
        local: {
          available: false,
          error: `Failed to check local Nextflow: ${error}`,
        },
        docker: {
          available: false,
          error: `Failed to check Docker Nextflow: ${error}`,
        },
      };
    }
  }

  /**
   * Get platform and architecture information
   */
  private async getPlatformInfo(): Promise<{
    platform: SystemCapabilities["platform"];
    architecture: SystemCapabilities["architecture"];
  }> {
    // This would ideally come from the backend, but we can infer from navigator
    const userAgent = navigator.userAgent.toLowerCase();

    let platform: SystemCapabilities["platform"] = "linux";
    if (userAgent.includes("win")) platform = "windows";
    else if (userAgent.includes("mac")) platform = "darwin";

    // Architecture detection is limited in browsers
    let architecture: SystemCapabilities["architecture"] = "x64";
    if (userAgent.includes("arm")) architecture = "arm64";

    return { platform, architecture };
  }

  /**
   * Get execution mode recommendations based on capabilities
   */
  async getExecutionRecommendations(): Promise<ExecutionModeRecommendation[]> {
    const capabilities = await this.getCapabilities();
    const recommendations: ExecutionModeRecommendation[] = [];

    // Local execution recommendation
    if (capabilities.nextflow.local.available) {
      recommendations.push({
        mode: ExecutionMode.LOCAL,
        reason: "Local Nextflow installation detected",
        requirements: ["Nextflow installed locally"],
        advantages: [
          "Fastest execution (no container overhead)",
          "Direct access to local files",
          "Simplified debugging",
        ],
        disadvantages: [
          "Less reproducible across systems",
          "Dependency management required",
          "Potential conflicts with system packages",
        ],
      });
    }

    // Docker execution recommendation
    if (capabilities.docker.available) {
      recommendations.push({
        mode: ExecutionMode.DOCKER,
        reason: "Docker available for containerized execution",
        requirements: ["Docker installed and running"],
        advantages: [
          "Maximum reproducibility",
          "Isolated execution environment",
          "No local dependency installation needed",
          "Portable across systems",
        ],
        disadvantages: [
          "Slower startup time",
          "Higher resource usage",
          "Requires container images",
        ],
      });
    }

    // Force Docker recommendation (when local Nextflow not available)
    if (
      !capabilities.nextflow.local.available &&
      capabilities.docker.available
    ) {
      recommendations.push({
        mode: ExecutionMode.FORCE_DOCKER,
        reason: "Local Nextflow not available, Docker required",
        requirements: ["Docker with Nextflow container"],
        advantages: [
          "Only option when Nextflow not locally installed",
          "Still provides full functionality",
          "Reproducible execution",
        ],
        disadvantages: [
          "Slower execution",
          "Requires Docker knowledge",
          "Higher resource requirements",
        ],
      });
    }

    // If neither is available
    if (
      !capabilities.nextflow.local.available &&
      !capabilities.docker.available
    ) {
      recommendations.push({
        mode: ExecutionMode.LOCAL,
        reason: "Neither Nextflow nor Docker detected - installation required",
        requirements: ["Install Nextflow or Docker"],
        advantages: [],
        disadvantages: ["Cannot execute workflows", "Requires system setup"],
      });
    }

    return recommendations;
  }

  /**
   * Get recommended Nextflow version based on execution mode
   */
  getRecommendedNextflowVersion(mode: ExecutionMode): NextflowVersion {
    switch (mode) {
      case ExecutionMode.LOCAL:
        // For local execution, prefer latest stable
        return (
          NEXTFLOW_VERSIONS.find((v) => v.isLatest) || NEXTFLOW_VERSIONS[0]
        );

      case ExecutionMode.DOCKER:
      case ExecutionMode.FORCE_DOCKER:
        // For Docker execution, prefer LTS for stability
        return (
          NEXTFLOW_VERSIONS.find((v) =>
            v.notes?.includes("Long-term support")
          ) ||
          NEXTFLOW_VERSIONS.find((v) => v.isRecommended) ||
          NEXTFLOW_VERSIONS[0]
        );

      default:
        return NEXTFLOW_VERSIONS[0];
    }
  }
}

/**
 * Validates execution settings against system capabilities
 */
export class ExecutionSettingsValidator {
  constructor(private capabilityDetector: ExecutionCapabilityDetector) {}

  /**
   * Validate execution settings
   */
  async validateSettings(
    settings: Partial<ExecutionSettings>
  ): Promise<ValidationResult> {
    const capabilities = await this.capabilityDetector.getCapabilities();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const recommendations =
      await this.capabilityDetector.getExecutionRecommendations();

    // Validate execution mode
    if (settings.mode) {
      await this.validateExecutionMode(
        settings.mode,
        capabilities,
        errors,
        warnings
      );
    }

    // Validate container settings
    if (settings.container?.enabled) {
      await this.validateContainerSettings(
        settings.container,
        capabilities,
        errors,
        warnings
      );
    }

    // Validate resource settings
    if (settings.resources) {
      this.validateResourceSettings(settings.resources, errors, warnings);
    }

    // Validate Nextflow version
    if (settings.nextflow?.version) {
      this.validateNextflowVersion(settings.nextflow.version, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  /**
   * Validate execution mode against capabilities
   */
  private async validateExecutionMode(
    mode: ExecutionMode,
    capabilities: SystemCapabilities,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    switch (mode) {
      case ExecutionMode.LOCAL:
        if (!capabilities.nextflow.local.available) {
          errors.push({
            field: "mode",
            message:
              "Local execution mode selected but Nextflow is not available locally",
            severity: "error",
          });
        }
        break;

      case ExecutionMode.DOCKER:
      case ExecutionMode.FORCE_DOCKER:
        if (!capabilities.docker.available) {
          errors.push({
            field: "mode",
            message:
              "Docker execution mode selected but Docker is not available",
            severity: "error",
          });
        }
        break;

      case ExecutionMode.HYBRID:
        if (!capabilities.nextflow.local.available) {
          warnings.push({
            field: "mode",
            message:
              "Hybrid mode may not work optimally without local Nextflow",
            suggestion: "Consider using Docker mode instead",
          });
        }
        if (!capabilities.docker.available) {
          warnings.push({
            field: "mode",
            message: "Hybrid mode requires Docker for containerized processes",
            suggestion: "Install Docker or use local mode only",
          });
        }
        break;
    }
  }

  /**
   * Validate container settings
   */
  private async validateContainerSettings(
    container: any,
    capabilities: SystemCapabilities,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (!capabilities.docker.available) {
      errors.push({
        field: "container.enabled",
        message: "Container execution enabled but Docker is not available",
        severity: "error",
      });
    }

    if (container.defaultImage) {
      // Basic image name validation
      if (!this.isValidImageName(container.defaultImage)) {
        errors.push({
          field: "container.defaultImage",
          message: "Invalid container image name format",
          severity: "error",
        });
      }

      // Warning for potentially slow pulls
      if (
        container.defaultImage.includes("biocontainers") &&
        container.pullPolicy === "always"
      ) {
        warnings.push({
          field: "container.pullPolicy",
          message:
            'BioContainers can be large - consider "if-not-present" pull policy',
          suggestion:
            'Change pull policy to "if-not-present" for faster execution',
        });
      }
    }
  }

  /**
   * Validate resource settings
   */
  private validateResourceSettings(
    resources: any,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // CPU validation
    if (
      resources.maxCpus &&
      (resources.maxCpus < 1 || resources.maxCpus > 64)
    ) {
      errors.push({
        field: "resources.maxCpus",
        message: "CPU count must be between 1 and 64",
        severity: "error",
      });
    }

    // Memory validation
    if (resources.maxMemory) {
      if (!this.isValidMemoryFormat(resources.maxMemory)) {
        errors.push({
          field: "resources.maxMemory",
          message: "Invalid memory format (use GB, MB, etc.)",
          severity: "error",
        });
      }
    }

    // Time validation
    if (resources.maxTime) {
      if (!this.isValidDuration(resources.maxTime)) {
        errors.push({
          field: "resources.maxTime",
          message:
            "Invalid time duration format (use ISO 8601 format like PT1H30M)",
          severity: "error",
        });
      }
    }

    // Resource ratio warnings
    if (resources.maxCpus && resources.maxMemory) {
      const memoryGB = this.parseMemoryToGB(resources.maxMemory);
      const cpuToMemoryRatio = memoryGB / resources.maxCpus;

      if (cpuToMemoryRatio < 1) {
        warnings.push({
          field: "resources",
          message: "Low memory per CPU core may cause performance issues",
          suggestion: "Consider at least 1-2GB memory per CPU core",
        });
      }
    }
  }

  /**
   * Validate Nextflow version
   */
  private validateNextflowVersion(
    version: string,
    warnings: ValidationWarning[]
  ): void {
    const knownVersions = NEXTFLOW_VERSIONS.map((v) => v.version);

    if (!knownVersions.includes(version)) {
      warnings.push({
        field: "nextflow.version",
        message: "Unknown Nextflow version specified",
        suggestion: `Consider using a known version: ${knownVersions
          .slice(0, 3)
          .join(", ")}`,
      });
    }

    const versionInfo = NEXTFLOW_VERSIONS.find((v) => v.version === version);
    if (versionInfo && !versionInfo.isRecommended) {
      warnings.push({
        field: "nextflow.version",
        message: "Using a non-recommended Nextflow version",
        suggestion:
          "Consider upgrading to a recommended version for better stability",
      });
    }
  }

  /**
   * Utility methods for validation
   */
  private isValidImageName(imageName: string): boolean {
    // Basic Docker image name validation
    const imageNameRegex =
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-zA-Z0-9_.-]+)?$/;
    return imageNameRegex.test(imageName);
  }

  private isValidMemoryFormat(memory: string): boolean {
    // Memory format validation (e.g., "4GB", "512MB")
    const memoryRegex = /^\d+(\.\d+)?\s*(GB|MB|KB|G|M|K|B)$/i;
    return memoryRegex.test(memory);
  }

  private isValidDuration(duration: string): boolean {
    // ISO 8601 duration validation
    const durationRegex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
    return durationRegex.test(duration);
  }

  private parseMemoryToGB(memory: string): number {
    const match = memory.match(/^(\d+(?:\.\d+)?)\s*(GB|MB|KB|G|M|K|B)$/i);
    if (!match) return 0;

    const value = Number.parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case "GB":
      case "G":
        return value;
      case "MB":
      case "M":
        return value / 1024;
      case "KB":
      case "K":
        return value / (1024 * 1024);
      default:
        return value / (1024 * 1024 * 1024);
    }
  }
}

// Singleton instances
export const capabilityDetector = new ExecutionCapabilityDetector();
export const settingsValidator = new ExecutionSettingsValidator(
  capabilityDetector
);

/**
 * Utility functions for common execution scenarios
 */
export class ExecutionModeHelper {
  /**
   * Get the best execution mode for the current system
   */
  static async getBestExecutionMode(): Promise<{
    mode: ExecutionMode;
    reason: string;
  }> {
    const recommendations =
      await capabilityDetector.getExecutionRecommendations();

    if (recommendations.length === 0) {
      return {
        mode: ExecutionMode.LOCAL,
        reason: "No recommendations available",
      };
    }

    // Prefer Docker for production, Local for development
    const dockerRec = recommendations.find(
      (r) => r.mode === ExecutionMode.DOCKER
    );
    const localRec = recommendations.find(
      (r) => r.mode === ExecutionMode.LOCAL
    );

    if (dockerRec && localRec) {
      // Both available - prefer Docker for reproducibility
      return { mode: ExecutionMode.DOCKER, reason: dockerRec.reason };
    }

    // Return the first (best) available option
    return { mode: recommendations[0].mode, reason: recommendations[0].reason };
  }

  /**
   * Check if a specific execution mode is feasible
   */
  static async isExecutionModeFeasible(mode: ExecutionMode): Promise<boolean> {
    const capabilities = await capabilityDetector.getCapabilities();

    switch (mode) {
      case ExecutionMode.LOCAL:
        return capabilities.nextflow.local.available;

      case ExecutionMode.DOCKER:
      case ExecutionMode.FORCE_DOCKER:
        return capabilities.docker.available;

      case ExecutionMode.HYBRID:
        return (
          capabilities.nextflow.local.available || capabilities.docker.available
        );

      default:
        return false;
    }
  }

  /**
   * Get user-friendly description of what each mode requires
   */
  static getExecutionModeRequirements(mode: ExecutionMode): string[] {
    switch (mode) {
      case ExecutionMode.LOCAL:
        return [
          "Nextflow installed on the system",
          "Required tools installed locally",
          "Direct file system access",
        ];

      case ExecutionMode.DOCKER:
        return [
          "Docker installed and running",
          "Container images available",
          "Sufficient disk space for containers",
        ];

      case ExecutionMode.FORCE_DOCKER:
        return [
          "Docker installed and running",
          "Nextflow container image",
          "All process containers available",
        ];

      case ExecutionMode.HYBRID:
        return [
          "Nextflow installed locally",
          "Docker available for containerized processes",
          "Mixed execution environment",
        ];

      default:
        return ["Unknown execution mode"];
    }
  }
}

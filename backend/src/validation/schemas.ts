import { z } from "zod";

// Request-body schemas for the public API. They bound sizes and shapes and
// reject values that would otherwise reach the shell or the file system
// unchecked. Graph contents (nodes/edges) stay loosely typed on purpose: their
// shape is owned by the frontend and evolves with it.

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_NODES = 2_000;
const MAX_EDGES = 5_000;
const MAX_SCRIPT_LENGTH = 5_000_000;
const MAX_INPUT_FILES = 1_000;

/** Any JSON object; used for React Flow nodes/edges and settings blobs. */
const jsonObject = z.record(z.unknown());

const workflowName = z.string().trim().max(MAX_NAME_LENGTH);
const workflowDescription = z.string().max(MAX_DESCRIPTION_LENGTH);
const workflowNodes = z.array(jsonObject).max(MAX_NODES);
const workflowEdges = z.array(jsonObject).max(MAX_EDGES);
const executionSettingsBlob = jsonObject.nullable();

export const createWorkflowSchema = z.object({
  name: workflowName.optional(),
  description: workflowDescription.optional(),
  nodes: workflowNodes,
  edges: workflowEdges,
  executionSettings: executionSettingsBlob.optional(),
  originType: z.enum(["database", "builtin", "imported"]).optional(),
  sourceFormat: z.enum(["visual", "nextflow"]).optional(),
  sourceKey: z.string().max(1_000).nullable().optional(),
  rawSource: z.string().max(MAX_SCRIPT_LENGTH).nullable().optional(),
  importWarnings: z.array(z.string().max(2_000)).max(1_000).optional(),
  isBuiltin: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
});
export type CreateWorkflowBody = z.infer<typeof createWorkflowSchema>;

export const updateWorkflowSchema = z
  .object({
    name: workflowName.optional(),
    description: workflowDescription.optional(),
    nodes: workflowNodes.optional(),
    edges: workflowEdges.optional(),
    executionSettings: executionSettingsBlob.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "No update data provided",
  });
export type UpdateWorkflowBody = z.infer<typeof updateWorkflowSchema>;

/** A single file name: no directories, no traversal, no NUL bytes. */
const inputFileName = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (name) =>
      name !== "." &&
      name !== ".." &&
      !name.includes("/") &&
      !name.includes("\\") &&
      !name.includes("\0"),
    { message: "must be a plain file name without path separators" }
  );

/** Docker image reference, e.g. ubuntu:22.04 or ghcr.io/org/img@sha256:… */
const dockerImage = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/, "must be a Docker image reference");

const memoryAmount = z
  .string()
  .max(32)
  .regex(/^\d+(\.\d+)?\s*\.?\s*[KMGT]?B$/i, 'must look like "4 GB"');

const nextflowVersion = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "must be a Nextflow version tag");

const outputNaming = z
  .string()
  .max(MAX_NAME_LENGTH)
  .refine((pattern) => !pattern.split(/[/\\]/).includes(".."), {
    message: "must not contain '..' path segments",
  });

export const executionSettingsSchema = z.object({
  useDocker: z.boolean().default(false),
  containerImage: dockerImage.or(z.literal("")).default("ubuntu:22.04"),
  outputDirectory: z.string().max(4_096).default("results"),
  outputNaming: outputNaming.default("{workflow_name}"),
  maxCpus: z.number().int().min(1).max(1_024).default(4),
  maxMemory: memoryAmount.default("4 GB"),
  executionTimeout: z.number().min(0).default(0),
  errorStrategy: z.string().max(64).default("terminate"),
  publishMode: z.string().max(64).optional(),
  cleanupOnFailure: z.boolean().default(true),
  nextflowVersion: nextflowVersion.optional(),
});

export const executeRequestSchema = z
  .object({
    script: z.string().max(MAX_SCRIPT_LENGTH).optional(),
    nextflowScript: z.string().max(MAX_SCRIPT_LENGTH).optional(),
    inputs: z
      .array(z.object({ name: z.string().min(1).max(255), value: z.unknown() }))
      .max(1_000)
      .optional(),
    nodeId: z.string().max(255).optional(),
    useDocker: z.boolean().optional(),
    containerImage: dockerImage.or(z.literal("")).optional(),
    outputDirectory: z.string().max(4_096).optional(),
    workflowName: z.string().max(MAX_NAME_LENGTH).optional(),
    fileContent: z
      .record(inputFileName, z.string())
      .refine((files) => Object.keys(files).length <= MAX_INPUT_FILES, {
        message: `at most ${MAX_INPUT_FILES} input files are allowed`,
      })
      .optional(),
    executionSettings: executionSettingsSchema.optional(),
  })
  .refine((body) => Boolean(body.script || body.nextflowScript), {
    message: "Script or nextflowScript is required",
  });
export type ExecuteRequestBody = z.infer<typeof executeRequestSchema>;

export const cancelExecutionSchema = z.object({
  executionId: z
    .string({ required_error: "Execution ID is required" })
    .min(1, "Execution ID is required")
    .max(512),
});

const customNodePortSchema = z
  .object({
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    label: z.string().max(MAX_NAME_LENGTH).optional(),
    kind: z.string().max(32).optional(),
    fileType: z.string().max(MAX_NAME_LENGTH).optional(),
    filePattern: z.string().max(1_000).optional(),
  })
  .passthrough();

export const saveCustomNodeSchema = z.object({
  node: z
    .object(
      {
        id: z
          .string({ required_error: "Custom node id is required" })
          .trim()
          .min(1, "Custom node id is required")
          .max(MAX_NAME_LENGTH),
        label: z.string().max(MAX_NAME_LENGTH).optional(),
        icon: z.string().max(MAX_NAME_LENGTH).optional(),
        processType: z.string().max(MAX_NAME_LENGTH).optional(),
        source: z.string().max(MAX_SCRIPT_LENGTH).optional(),
        inputs: z.array(customNodePortSchema).max(500).optional(),
        outputs: z.array(customNodePortSchema).max(500).optional(),
      },
      { required_error: "Custom node payload is required" }
    )
    .passthrough(),
});

export const installNfCoreModuleSchema = z.object({
  id: z
    .string({ required_error: "Module id is required" })
    .trim()
    .min(1, "Module id is required")
    .max(MAX_NAME_LENGTH),
});

export const nfCoreModuleSourceQuerySchema = z.object({
  id: z
    .string({ required_error: "Module id is required" })
    .regex(
      /^nf-core\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/,
      'must look like "nf-core/fastqc"'
    ),
});

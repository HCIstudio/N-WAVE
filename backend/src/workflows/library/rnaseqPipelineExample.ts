import { loadJsonExample } from "./jsonExample";

// Built-in example: nf-core/rnaseq 3.27.0 as a Pipeline node, preset to the
// pipeline's test data, with notes on the canvas. The browser demo has the
// same definition in frontend/src/demo/rnaseqExample.ts (a frontend test
// keeps them identical).
const example = loadJsonExample(
  "rnaseq_pipeline_example.json",
  "examples/rnaseq-pipeline"
);

export const rnaseqPipelineExampleId = example.id;
export const getRnaseqPipelineExampleDescriptor = example.getDescriptor;

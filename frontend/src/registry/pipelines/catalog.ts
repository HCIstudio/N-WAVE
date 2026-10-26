// The nf-core pipelines the Pipeline node offers, from nf-co.re's
// pipelines.json (through the backend, or the browser in the demo).

export interface PipelineInfo {
  name: string;
  description: string;
  /** Release tags, newest first. */
  versions: string[];
  archived: boolean;
}

export interface PipelineCatalog {
  pipelines: PipelineInfo[];
  /** True when nf-co.re couldn't be reached and an older list is shown. */
  stale?: boolean;
}

export const PIPELINES_URL = "https://nf-co.re/pipelines.json";

/** Where people find a pipeline's documentation and releases. */
export const pipelinePageUrl = (name: string): string =>
  name ? `https://nf-co.re/${name}` : "https://nf-co.re/pipelines";

interface RemoteRelease {
  tag_name?: unknown;
  published_at?: unknown;
}

interface RemoteWorkflow {
  name?: unknown;
  description?: unknown;
  archived?: unknown;
  releases?: unknown;
}

/** The pipelines in nf-co.re's pipelines.json (the backend reads it alike). */
export const parsePipelinesJson = (data: unknown): PipelineInfo[] => {
  const workflows = (data as { remote_workflows?: unknown })?.remote_workflows;
  if (!Array.isArray(workflows)) {
    throw new Error("nf-co.re/pipelines.json has no remote_workflows list");
  }
  return (workflows as RemoteWorkflow[])
    .filter(
      (workflow) =>
        typeof workflow.name === "string" &&
        /^[a-z0-9][a-z0-9_-]*$/.test(workflow.name),
    )
    .map((workflow) => ({
      name: workflow.name as string,
      description:
        typeof workflow.description === "string" ? workflow.description : "",
      // "dev" comes without a publish date; only releases are listed.
      versions: (Array.isArray(workflow.releases)
        ? (workflow.releases as RemoteRelease[])
        : []
      )
        .filter(
          (release) =>
            typeof release.tag_name === "string" &&
            typeof release.published_at === "string",
        )
        .sort((a, b) =>
          String(b.published_at).localeCompare(String(a.published_at)),
        )
        .map((release) => release.tag_name as string),
      archived: workflow.archived === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * The pipelines matching what was typed: names first, then descriptions;
 * archived pipelines only when nothing else matches by name.
 */
export const searchPipelines = (
  pipelines: PipelineInfo[],
  text: string,
): PipelineInfo[] => {
  const query = text.trim().toLowerCase();
  const active = pipelines.filter((pipeline) => !pipeline.archived);
  if (!query) return active;
  const byName = pipelines.filter((pipeline) =>
    pipeline.name.includes(query),
  );
  const byDescription = active.filter(
    (pipeline) =>
      !pipeline.name.includes(query) &&
      pipeline.description.toLowerCase().includes(query),
  );
  const activeByName = byName.filter((pipeline) => !pipeline.archived);
  return [
    ...(activeByName.length > 0 ? activeByName : byName),
    ...byDescription,
  ];
};

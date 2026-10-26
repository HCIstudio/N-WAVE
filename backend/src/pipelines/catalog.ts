import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import { PIPELINE_NAME } from "./schema";

// The nf-core pipelines and their releases, from nf-co.re/pipelines.json
// (what `nf-core pipelines list` reads). The Pipeline node offers them to
// pick from. Kept in memory for a while and on disk for when nf-co.re can't
// be reached.

export const PIPELINES_URL = "https://nf-co.re/pipelines.json";

/** How long a fetched list is used before it's fetched again. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PipelineInfo {
  name: string;
  description: string;
  /** Release tags, newest first. */
  versions: string[];
  archived: boolean;
}

export interface PipelineCatalog {
  pipelines: PipelineInfo[];
  /** When the list was fetched from nf-co.re. */
  fetchedAt: string;
  /** True when nf-co.re couldn't be reached and an older copy is used. */
  stale?: boolean;
}

const cachePath = (): string =>
  path.join(getNwaveDataRoot(), "pipelines", "catalog.json");

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

/** The pipelines in nf-co.re's pipelines.json, by name. */
export const parsePipelinesJson = (data: unknown): PipelineInfo[] => {
  const workflows = (data as { remote_workflows?: unknown })?.remote_workflows;
  if (!Array.isArray(workflows)) {
    throw new Error("nf-co.re/pipelines.json has no remote_workflows list");
  }
  return (workflows as RemoteWorkflow[])
    .filter(
      (workflow) =>
        typeof workflow.name === "string" && PIPELINE_NAME.test(workflow.name),
    )
    .map((workflow) => {
      const releases = Array.isArray(workflow.releases)
        ? (workflow.releases as RemoteRelease[])
        : [];
      // "dev" comes without a publish date; only releases are listed.
      const versions = releases
        .filter(
          (release) =>
            typeof release.tag_name === "string" &&
            typeof release.published_at === "string",
        )
        .sort((a, b) =>
          String(b.published_at).localeCompare(String(a.published_at)),
        )
        .map((release) => release.tag_name as string);
      return {
        name: workflow.name as string,
        description:
          typeof workflow.description === "string" ? workflow.description : "",
        versions,
        archived: workflow.archived === true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

let memory: PipelineCatalog | null = null;

/** Forgets the in-memory copy (tests). */
export const resetPipelineCatalog = (): void => {
  memory = null;
};

const readDiskCopy = (): PipelineCatalog | null => {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8")) as PipelineCatalog;
  } catch {
    return null;
  }
};

/** The nf-core pipelines, fetched at most every few hours. */
export const getPipelineCatalog = async (): Promise<PipelineCatalog> => {
  if (memory && Date.now() - Date.parse(memory.fetchedAt) < MAX_AGE_MS) {
    return memory;
  }
  try {
    const response = await axios.get<unknown>(PIPELINES_URL, {
      headers: { "User-Agent": "N-WAVE-pipelines" },
      timeout: 30_000,
    });
    const catalog: PipelineCatalog = {
      pipelines: parsePipelinesJson(response.data),
      fetchedAt: new Date().toISOString(),
    };
    memory = catalog;
    const file = cachePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(catalog));
    fs.renameSync(`${file}.tmp`, file);
    return catalog;
  } catch (error: unknown) {
    const copy = memory ?? readDiskCopy();
    if (copy) return { ...copy, stale: true };
    throw error;
  }
};

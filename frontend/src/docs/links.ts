// Where N-WAVE's documentation lives, for links from the app: the wiki's guides (written in the
// repository's wiki/ folder) and the README. frontend/src/docs/links.test.ts checks that every
// page and heading linked from the app exists.

export const REPOSITORY_URL = "https://github.com/HCIstudio/N-WAVE";
export const README_URL = `${REPOSITORY_URL}#readme`;
export const WIKI_URL = `${REPOSITORY_URL}/wiki`;

/** The wiki's guide pages, with their titles. */
export const WIKI_PAGES = {
  Installation: "Installation",
  "First-Workflow": "Your first workflow",
  "Building-Workflows": "Building workflows",
  Nodes: "Node reference",
  "nf-core-Library": "nf-core library",
  "Custom-Nodes": "Custom nodes",
  "Node-Packs": "Node packs",
  "Running-Workflows": "Running workflows",
  "Run-Profiles": "Run profiles",
  "Exporting-Projects": "Exporting projects",
  Troubleshooting: "Troubleshooting",
} as const;

export type WikiPage = keyof typeof WIKI_PAGES;

/** A place in the wiki: a page, and optionally a heading on it. */
export interface WikiLink {
  page: WikiPage;
  /** The heading's anchor, e.g. "out-of-memory". */
  anchor?: string;
}

export const wikiUrl = ({ page, anchor }: WikiLink): string =>
  `${WIKI_URL}/${page}${anchor ? `#${anchor}` : ""}`;

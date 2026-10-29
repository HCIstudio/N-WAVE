// Checks the roadmap's issue and milestone numbers against GitHub, so a renumbered milestone or a
// wrong issue number doesn't leave the Roadmap page pointing at the wrong place. It needs the
// network, so it only runs with CHECK_ROADMAP_LINKS=1 (the "Roadmap links" step in CI, which
// also passes GITHUB_TOKEN for a higher rate limit):
//
//   CHECK_ROADMAP_LINKS=1 pnpm vitest run src/roadmap/roadmap.github.test.ts

import { describe, expect, it } from "vitest";
import { featureStatus, RELEASES, ROADMAP_ISSUE } from "./roadmap";

const enabled = process.env.CHECK_ROADMAP_LINKS === "1";
const token = process.env.GITHUB_TOKEN;
const API = "https://api.github.com/repos/HCIstudio/N-WAVE";

interface GitHubIssue {
  number: number;
  state: "open" | "closed";
  pull_request?: unknown;
  milestone: { number: number } | null;
}

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return (await response.json()) as T;
};

describe.skipIf(!enabled)("roadmap links on GitHub", () => {
  it("names milestones that exist with the release's version", async () => {
    for (const release of RELEASES) {
      const milestone = await get<{ title: string }>(`/milestones/${release.milestone}`);
      expect(milestone.title, `milestone ${release.milestone}`).toMatch(new RegExp(`^v${release.version.replace(/\./g, "\\.")} `));
    }
  });

  it("links issues that exist, in their release's milestone", async () => {
    const roadmap = await get<GitHubIssue>(`/issues/${ROADMAP_ISSUE}`);
    expect(roadmap.pull_request).toBeUndefined();
    for (const release of RELEASES) {
      for (const feature of release.features) {
        if (feature.issue === undefined) continue;
        const issue = await get<GitHubIssue>(`/issues/${feature.issue}`);
        const where = `#${feature.issue} (${feature.title})`;
        expect(issue.pull_request, `${where} is a pull request`).toBeUndefined();
        expect(issue.milestone?.number, `${where} milestone`).toBe(release.milestone);
        if (featureStatus(feature, release) === "planned") {
          expect(issue.state, `${where} is closed but planned`).toBe("open");
        }
      }
    }
  }, 60_000);
});

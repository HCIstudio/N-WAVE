import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featureStatus, minorVersion, RELEASES, ROADMAP_UPDATED_FOR, type RoadmapRelease } from "./roadmap";

const packageVersion = (): string =>
  JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8")).version;

describe("roadmap", () => {
  it("is up to date with the current minor version", () => {
    // Fails on every minor release until roadmap.ts is updated: mark the new version
    // released and set ROADMAP_UPDATED_FOR to it.
    const current = minorVersion(packageVersion());
    expect(ROADMAP_UPDATED_FOR, "update frontend/src/roadmap/roadmap.ts for this release").toBe(current);
    const release = RELEASES.find((entry) => entry.version === current);
    expect(release?.status, `v${current} in the roadmap`).toBe("released");
  });

  it("lists the releases in order: released, then at most one in progress, then planned", () => {
    const order = { released: 0, "in-progress": 1, planned: 2 } as const;
    const ranks = RELEASES.map((release) => order[release.status]);
    expect(ranks).toEqual([...ranks].sort());
    expect(RELEASES.filter((release) => release.status === "in-progress").length).toBeLessThanOrEqual(1);
  });

  it("has no released release after the current version", () => {
    const index = RELEASES.findIndex((release) => release.version === ROADMAP_UPDATED_FOR);
    expect(RELEASES.slice(index + 1).every((release) => release.status !== "released")).toBe(true);
  });

  it("links every planned feature to an issue, and every issue once", () => {
    const issues: number[] = [];
    for (const release of RELEASES) {
      expect(release.goal).not.toBe("");
      for (const feature of release.features) {
        if (featureStatus(feature, release) !== "released") {
          expect(feature.issue, `${release.version}: ${feature.title}`).toBeGreaterThan(0);
        }
        if (feature.issue !== undefined) issues.push(feature.issue);
      }
    }
    expect(new Set(issues).size).toBe(issues.length);
    const milestones = RELEASES.map((release) => release.milestone);
    expect(new Set(milestones).size).toBe(milestones.length);
  });

  it("gives upcoming releases a reason, and no dates", () => {
    for (const release of RELEASES.filter((entry) => entry.status !== "released")) {
      expect(release.why, release.version).toBeTruthy();
    }
    const text = JSON.stringify(RELEASES);
    expect(text).not.toMatch(/\b20\d\d\b|\bQ[1-4]\b|January|February|March|April|June|July|August|September|October|November|December/);
  });

  it("shows a feature as planned in a release in progress, unless it says otherwise", () => {
    const release: RoadmapRelease = {
      version: "9.9",
      name: "Test",
      status: "in-progress",
      milestone: 0,
      goal: "Test",
      features: [],
    };
    expect(featureStatus({ title: "a" }, release)).toBe("planned");
    expect(featureStatus({ title: "b", status: "released" }, release)).toBe("released");
    expect(featureStatus({ title: "c" }, { ...release, status: "released" })).toBe("released");
  });
});

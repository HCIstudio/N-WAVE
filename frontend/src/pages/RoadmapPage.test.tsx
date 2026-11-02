import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { RELEASES, ROADMAP_UPDATED_FOR, TODAY } from "../roadmap/roadmap";
import RoadmapPage from "./RoadmapPage";

const setup = () =>
  render(
    <MemoryRouter initialEntries={["/roadmap"]}>
      <RoadmapPage />
    </MemoryRouter>,
  );

describe("RoadmapPage", () => {
  it("says why N-WAVE exists and what it does today, with guides", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Roadmap", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why N-WAVE" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: `What it does today (v${ROADMAP_UPDATED_FOR})` })).toBeTruthy();
    for (const feature of TODAY) expect(screen.getByText(feature.title)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^Guide:/ })).toHaveLength(TODAY.length);
  });

  it("shows every release in order: released ones small, then the one in progress and the planned ones", () => {
    setup();
    const timeline = screen.getByRole("list", { name: "Releases" });
    const titles = within(timeline)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(RELEASES.map((release) => `v${release.version} ${release.name}`));
    // Released versions: their name (linking their milestone) and one line.
    for (const release of RELEASES.filter((entry) => entry.status === "released")) {
      const link = within(timeline).getByRole("link", { name: `v${release.version} ${release.name}` });
      expect(link.getAttribute("href")).toBe(`https://github.com/HCIstudio/N-WAVE/milestone/${release.milestone}`);
      expect(within(timeline).getByText(release.summary as string)).toBeTruthy();
    }
    expect(within(timeline).getAllByText("The current version")).toHaveLength(1);
    expect(within(timeline).getByText("In progress")).toBeTruthy();
    const ahead = RELEASES.filter((release) => release.status !== "released");
    for (const release of ahead) {
      for (const feature of release.features) {
        if (feature.issue === undefined) continue;
        const link = screen.getByRole("link", { name: `Issue ${feature.issue}: ${feature.title}` });
        expect(link.getAttribute("href")).toBe(`https://github.com/HCIstudio/N-WAVE/issues/${feature.issue}`);
        expect(link.getAttribute("target")).toBe("_blank");
      }
    }
  });

  it("has ways to get involved", () => {
    setup();
    expect(screen.getByRole("link", { name: "Report a bug or suggest a feature" })).toBeTruthy();
    expect(screen.getByText(new RegExp(`Last updated for v${ROADMAP_UPDATED_FOR.replace(".", "\\.")}`))).toBeTruthy();
  });
});

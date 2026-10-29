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

  it("shows the current version and every release ahead, in order, with their issues", () => {
    setup();
    const timeline = screen.getByRole("list", { name: "Releases" });
    const titles = within(timeline)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    const ahead = RELEASES.filter((release) => release.status !== "released");
    expect(titles).toEqual(
      [RELEASES.find((release) => release.version === ROADMAP_UPDATED_FOR), ...ahead].map(
        (release) => `v${release?.version} ${release?.name}`,
      ),
    );
    expect(within(timeline).getByText("The current version")).toBeTruthy();
    for (const release of ahead) {
      for (const feature of release.features) {
        if (feature.issue === undefined) continue;
        const link = screen.getByRole("link", { name: `Issue ${feature.issue}: ${feature.title}` });
        expect(link.getAttribute("href")).toBe(`https://github.com/HCIstudio/N-WAVE/issues/${feature.issue}`);
        expect(link.getAttribute("target")).toBe("_blank");
      }
    }
  });

  it("keeps earlier releases and ways to get involved", () => {
    setup();
    expect(screen.getByText("Earlier releases")).toBeTruthy();
    expect(screen.getByRole("link", { name: "v1.3 The Node Update" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report a bug or suggest a feature" })).toBeTruthy();
    expect(screen.getByText(new RegExp(`Last updated for v${ROADMAP_UPDATED_FOR.replace(".", "\\.")}`))).toBeTruthy();
  });
});

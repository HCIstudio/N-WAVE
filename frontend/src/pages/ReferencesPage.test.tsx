import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { REFERENCES } from "../references/references";
import ReferencesPage from "./ReferencesPage";

const citation = readFileSync(join(__dirname, "../../../CITATION.cff"), "utf8");

describe("ReferencesPage", () => {
  it("cites each publication with its DOI, and says where N-WAVE uses it", () => {
    render(
      <MemoryRouter>
        <ReferencesPage />
      </MemoryRouter>,
    );
    const list = screen.getByRole("list", { name: "References" });
    const entries = within(list).getAllByRole("article");
    expect(entries).toHaveLength(REFERENCES.length);
    const bioflow = screen.getByRole("article", { name: /BioFlow-Insight/ });
    expect(within(bioflow).getByRole("link", { name: "doi:10.1093/nargab/lqae092" }).getAttribute("href")).toBe(
      "https://doi.org/10.1093/nargab/lqae092",
    );
    expect(within(bioflow).getByRole("link", { name: /^Analyse/ }).getAttribute("href")).toBe(
      "https://github.com/HCIstudio/N-WAVE/wiki/Workflow-Analysis",
    );
    const metamodel = screen.getByRole("article", { name: /Consolidated View on Specification Languages/ });
    expect(within(metamodel).getByRole("link", { name: /DAW model/ }).getAttribute("href")).toBe(
      "https://github.com/HCIstudio/N-WAVE/wiki/DAW-Model",
    );
  });

  it("lists the same publications as CITATION.cff", () => {
    const cited = [...citation.matchAll(/^\s+doi: (\S+)$/gm)].map((match) => match[1]).sort();
    expect(REFERENCES.map((reference) => reference.doi).sort()).toEqual(cited);
  });
});

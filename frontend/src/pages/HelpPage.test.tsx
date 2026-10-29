import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../glossary/glossary";
import HelpPage from "./HelpPage";

const setup = (entry = "/help") => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <HelpPage />
    </MemoryRouter>,
  );
  return { user };
};

const terms = () => screen.queryAllByRole("term").map((term) => term.textContent);

describe("HelpPage", () => {
  it("lists every term with its explanation and related terms", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Help", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Glossary" })).toBeTruthy();
    expect(terms()).toEqual(GLOSSARY.map((entry) => entry.term));
    const meta = document.getElementById("meta") as HTMLElement;
    expect(within(meta).getByRole("link", { name: "Tuple" }).getAttribute("href")).toBe("#tuple");
  });

  it("says what N-WAVE does, what the node colors mean and what the canvas has", () => {
    setup();
    expect(screen.getByRole("heading", { name: "What N-WAVE does" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Node colors and shapes" })).toBeTruthy();
    expect(screen.getByText("Run and Resume:")).toBeTruthy();
  });

  it("links each term to its guide in the wiki, and the page to the other docs", () => {
    setup();
    const meta = document.getElementById("meta") as HTMLElement;
    expect(within(meta).getByRole("link", { name: "nf-core library" }).getAttribute("href")).toBe(
      "https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library#using-a-module",
    );
    const help = screen.getByRole("navigation", { name: "More help" });
    expect(within(help).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://github.com/HCIstudio/N-WAVE/wiki",
      "https://github.com/HCIstudio/N-WAVE/wiki/First-Workflow",
      "https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting",
      "https://github.com/HCIstudio/N-WAVE#readme",
      "/roadmap",
    ]);
  });

    it("filters the terms by a search", async () => {
    const { user } = setup();
    await user.type(screen.getByPlaceholderText("Search terms..."), "container");
    expect(terms()).toEqual(expect.arrayContaining(["Container", "Docker", "Module"]));
    expect(terms()).not.toContain("Tuple");
    await user.clear(screen.getByPlaceholderText("Search terms..."));
    await user.type(screen.getByPlaceholderText("Search terms..."), "zzz");
    expect(screen.getByText("No term matches “zzz”.")).toBeTruthy();
  });
});

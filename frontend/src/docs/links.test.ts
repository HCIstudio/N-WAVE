import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../glossary/glossary";
import { WIKI_PAGES, type WikiLink } from "./links";

const WIKI_DIR = join(__dirname, "../../../wiki");

// GitHub's anchor for a heading: lower case, punctuation dropped, spaces as dashes.
const anchorsOf = (page: string): string[] =>
  readFileSync(join(WIKI_DIR, `${page}.md`), "utf8")
    .split("\n")
    .filter((line) => /^#{2,4} /.test(line))
    .map((line) =>
      line
        .replace(/^#+ /, "")
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .replace(/ /g, "-"),
    );

// Failure explanations are checked against wiki/Troubleshooting.md in their own tests.
describe("links from the app to the wiki", () => {
  it("name pages that exist in wiki/", () => {
    for (const page of Object.keys(WIKI_PAGES)) {
      expect(existsSync(join(WIKI_DIR, `${page}.md`)), page).toBe(true);
    }
  });

  it("give every glossary term a guide, at a heading that exists", () => {
    for (const entry of GLOSSARY) {
      expect(entry.docs, entry.id).toBeDefined();
      const { page, anchor } = entry.docs as WikiLink;
      if (anchor) expect(anchorsOf(page), `${entry.id} → ${page}#${anchor}`).toContain(anchor);
    }
  });
});

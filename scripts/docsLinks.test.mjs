// Checks the links in the READMEs and the wiki pages (wiki/), so a renamed page, file or
// heading doesn't leave a broken link behind: relative files, wiki pages, files in the
// repository and the headings their #anchors point to. Also checks that images have alt
// text and that wiki sections start at ## (the wiki adds the page title).
//
//   node --test scripts/docsLinks.test.mjs

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WIKI = "https://github.com/HCIstudio/N-WAVE/wiki";
const REPO = "https://github.com/HCIstudio/N-WAVE";

/** Every Markdown file the checks cover. */
const markdownFiles = () => {
  const files = ["README.md", "CONTRIBUTING.md", "backend/README.md", "frontend/README.md", "scripts/README.md"];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "README.md") files.push(path);
    }
  };
  walk("frontend/src");
  for (const name of readdirSync(join(ROOT, "wiki"))) {
    if (name.endsWith(".md")) files.push(join("wiki", name));
  }
  return files;
};

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces as dashes. */
export const anchorOf = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/ /g, "-");

const headingsCache = new Map();
/** The anchors of a Markdown file's headings, outside code blocks. */
const anchorsOf = (file) => {
  if (!headingsCache.has(file)) {
    const anchors = new Set();
    let inCode = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("```")) inCode = !inCode;
      const heading = !inCode && line.match(/^#{1,6} (.+)$/);
      if (heading) anchors.add(anchorOf(heading[1]));
    }
    headingsCache.set(file, anchors);
  }
  return headingsCache.get(file);
};

/** Links in a Markdown file, outside code: `[text](target)` and `![alt](target)`. */
const linksOf = (text) => {
  const links = [];
  let inCode = false;
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) inCode = !inCode;
    if (inCode) return;
    const outsideInlineCode = line.replace(/`[^`]*`/g, "");
    for (const match of outsideInlineCode.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      links.push({ image: match[1] === "!", text: match[2], target: match[3], line: index + 1 });
    }
  });
  return links;
};

/** What is wrong with one link, or null. */
const checkLink = (file, target) => {
  const [path, anchor] = target.split("#");
  const needAnchor = (targetFile) =>
    anchor === undefined || anchorsOf(targetFile).has(anchor) ? null : `no heading #${anchor} in ${relative(ROOT, targetFile)}`;

  if (target.startsWith(WIKI)) {
    const page = path.slice(WIKI.length).replace(/^\//, "") || "Home";
    const pageFile = join(ROOT, "wiki", `${page}.md`);
    return existsSync(pageFile) ? needAnchor(pageFile) : `no wiki page ${page} (wiki/${page}.md)`;
  }
  if (target.startsWith(`${REPO}/blob/main/`) || target.startsWith(`${REPO}/tree/main/`)) {
    const repoPath = join(ROOT, path.replace(/^.*\/(blob|tree)\/main\//, ""));
    if (!existsSync(repoPath)) return `no ${relative(ROOT, repoPath)} in the repository`;
    return repoPath.endsWith(".md") ? needAnchor(repoPath) : null;
  }
  if (path === REPO) return anchor === undefined || anchor === "readme" ? null : needAnchor(join(ROOT, "README.md"));
  if (/^[a-z]+:/.test(target)) return null;
  if (path === "") return needAnchor(join(ROOT, file));
  const local = resolve(ROOT, dirname(file), path);
  if (!existsSync(local)) return `no file ${relative(ROOT, local)}`;
  return statSync(local).isFile() && local.endsWith(".md") ? needAnchor(local) : null;
};

for (const file of markdownFiles()) {
  test(`links in ${file}`, () => {
    const text = readFileSync(join(ROOT, file), "utf8");
    const problems = [];
    for (const link of linksOf(text)) {
      if (link.image && link.text.trim() === "") problems.push(`line ${link.line}: an image without alt text`);
      const problem = checkLink(file, link.target);
      if (problem) problems.push(`line ${link.line}: ${link.target}: ${problem}`);
    }
    if (file.startsWith("wiki/") && !file.endsWith("README.md") && /^# /m.test(text.replace(/```[\s\S]*?```/g, ""))) {
      problems.push("a wiki page starts its sections at ##, not #");
    }
    assert.deepEqual(problems, []);
  });
}

test("anchors follow GitHub's rules", () => {
  assert.equal(anchorOf("Docker isn't reachable"), "docker-isnt-reachable");
  assert.equal(anchorOf('"client version 1.32 is too old"'), "client-version-132-is-too-old");
  assert.equal(anchorOf("Running on SLURM from N-WAVE"), "running-on-slurm-from-n-wave");
});

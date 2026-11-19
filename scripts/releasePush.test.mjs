// Tests scripts/release-push.sh, the last git step of a release, against real
// git repositories: main unchanged, main moved on while the release was built,
// a newer pull request that set the version by hand, and a version already set.
//
//   node --test scripts/releasePush.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "release-push.sh");
const dirs = [];

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const setVersion = (cwd, version) => {
  for (const path of ["frontend/package.json", "backend/package.json"]) {
    writeFileSync(join(cwd, path), `${JSON.stringify({ name: path.split("/")[0], version }, null, 2)}\n`);
  }
};
const versionOf = (cwd, ref) => JSON.parse(git(cwd, "show", `${ref}:frontend/package.json`)).version;

/** A remote with main at version 1.0.0, and a clone of it: the release's checkout. */
const setUp = () => {
  const root = mkdtempSync(join(tmpdir(), "release-push-"));
  dirs.push(root);
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "clone", "-q", remote, seed);
  git(seed, "config", "user.name", "test");
  git(seed, "config", "user.email", "test@example.invalid");
  mkdirSync(join(seed, "frontend"));
  mkdirSync(join(seed, "backend"));
  setVersion(seed, "1.0.0");
  writeFileSync(join(seed, "app.txt"), "one\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "start");
  git(seed, "push", "-q", "origin", "HEAD:main");
  const release = join(root, "release");
  git(root, "clone", "-q", remote, release);
  git(release, "config", "user.name", "release");
  git(release, "config", "user.email", "release@example.invalid");
  return { root, remote, seed, release, built: git(release, "rev-parse", "HEAD") };
};

/** A pull request merged into main by someone else. */
const mergeElsewhere = (seed, change) => {
  git(seed, "pull", "-q", "origin", "main");
  change();
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "merged meanwhile");
  git(seed, "push", "-q", "origin", "HEAD:main");
  return git(seed, "rev-parse", "HEAD");
};

const release = (cwd, version) => {
  setVersion(cwd, version);
  return execFileSync("bash", [SCRIPT, version], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("main unchanged: the version commit goes on main, and the tag names it", () => {
  const { remote, release: cwd, built } = setUp();
  release(cwd, "1.0.1");
  const main = git(remote, "rev-parse", "main");
  assert.equal(git(remote, "rev-parse", "v1.0.1^{commit}"), main);
  assert.equal(git(remote, "rev-parse", "main^"), built);
  assert.equal(versionOf(remote, "main"), "1.0.1");
});

test("main moved on during the build: the tag names what was built, main gets the version on top", () => {
  const { remote, seed, release: cwd, built } = setUp();
  const merged = mergeElsewhere(seed, () => writeFileSync(join(seed, "app.txt"), "two\n"));
  release(cwd, "1.0.1");
  // The tag: the built commit with its version, without the change merged meanwhile.
  assert.equal(git(remote, "rev-parse", "v1.0.1^"), built);
  assert.equal(git(remote, "show", "v1.0.1:app.txt"), "one");
  assert.equal(versionOf(remote, "v1.0.1"), "1.0.1");
  // main: the change merged meanwhile, then the version commit.
  assert.equal(git(remote, "rev-parse", "main^"), merged);
  assert.equal(git(remote, "show", "main:app.txt"), "two");
  assert.equal(versionOf(remote, "main"), "1.0.1");
});

test("a newer pull request set the version by hand: only the tag is pushed, main keeps its version", () => {
  const { remote, seed, release: cwd, built } = setUp();
  const merged = mergeElsewhere(seed, () => setVersion(seed, "1.1.0"));
  const output = release(cwd, "1.0.1");
  assert.match(output, /Pushing only the tag v1\.0\.1/);
  assert.equal(git(remote, "rev-parse", "v1.0.1^"), built);
  assert.equal(git(remote, "rev-parse", "main"), merged);
  assert.equal(versionOf(remote, "main"), "1.1.0");
});

test("a version set by hand in the released pull request: tagging only", () => {
  const { remote, seed, release: cwd } = setUp();
  mergeElsewhere(seed, () => setVersion(seed, "1.1.0"));
  git(cwd, "pull", "-q", "origin", "main");
  const head = git(cwd, "rev-parse", "HEAD");
  const output = release(cwd, "1.1.0");
  assert.match(output, /already at v1\.1\.0; tagging only/);
  assert.equal(git(remote, "rev-parse", "v1.1.0^{commit}"), head);
  assert.equal(git(remote, "rev-parse", "main"), head);
});


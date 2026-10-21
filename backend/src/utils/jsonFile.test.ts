import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonFile, writeJsonFile } from "./jsonFile";

describe("JSON state files", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-json-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("are written whole, through a temporary file", () => {
    const file = path.join(root, "state", "runs.json");
    writeJsonFile(file, { a: 1 });
    writeJsonFile(file, { a: 2 });
    expect(readJsonFile(file, {})).toEqual({ a: 2 });
    expect(fs.readdirSync(path.dirname(file))).toEqual(["runs.json"]);
  });

  it("read as the fallback when missing, and set an unreadable one aside", () => {
    const file = path.join(root, "runs.json");
    expect(readJsonFile(file, { empty: true })).toEqual({ empty: true });
    fs.writeFileSync(file, '{"old_1": {"dir": "/tmp/ol');
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readJsonFile(file, {})).toEqual({});
    warn.mockRestore();
    const [aside] = fs.readdirSync(root);
    expect(aside).toMatch(/^runs\.json\.unreadable-/);
    // Its content is kept, and the next write doesn't touch it.
    expect(fs.readFileSync(path.join(root, aside ?? ""), "utf8")).toBe('{"old_1": {"dir": "/tmp/ol');
    writeJsonFile(file, { new_1: {} });
    expect(fs.readdirSync(root).sort()).toEqual(["runs.json", aside].sort());
  });
});

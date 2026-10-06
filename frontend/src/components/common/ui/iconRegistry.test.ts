import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { iconRegistry } from "./iconRegistry";

// Collect every icon name the source code stores as a string, so adding a
// node with a new icon fails here instead of silently rendering no icon.
const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [path] : [];
  });

const srcRoot = join(__dirname, "..", "..", "..");
const referencedIconNames = new Set<string>();
for (const file of collectSourceFiles(srcRoot)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bicon:\s*"([A-Z][A-Za-z0-9]*)"/g)) {
    referencedIconNames.add(match[1]);
  }
  for (const match of source.matchAll(/<DynamicIcon\s+name="([A-Za-z0-9]+)"/g)) {
    referencedIconNames.add(match[1]);
  }
}
const iconPicker = readFileSync(
  join(srcRoot, "components/common/forms/CustomNodeModal.tsx"),
  "utf8"
).match(/const iconOptions = \[([\s\S]*?)\]/);
for (const match of iconPicker?.[1].matchAll(/"([A-Za-z0-9]+)"/g) ?? []) {
  referencedIconNames.add(match[1]);
}

describe("iconRegistry", () => {
  it("finds icon references to check", () => {
    expect(referencedIconNames.size).toBeGreaterThan(10);
  });

  it.each([...referencedIconNames])("registers %s", (name) => {
    expect(iconRegistry[name]).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { GLOSSARY, glossaryEntry } from "./glossary";

describe("the glossary", () => {
  it("explains the terms novices meet, each once", () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["process", "channel", "tuple", "meta", "samplesheet", "container"] as const) {
      expect(glossaryEntry(id).definition).toBeTruthy();
    }
  });

  it("keeps explanations short and links only to entries it has", () => {
    for (const entry of GLOSSARY) {
      expect(entry.definition.length).toBeLessThanOrEqual(240);
      expect(entry.definition).toMatch(/\.$/);
      for (const related of entry.related ?? []) {
        expect(ids()).toContain(related);
        expect(related).not.toBe(entry.id);
      }
    }
  });

  it("is sorted alphabetically", () => {
    const terms = GLOSSARY.map((entry) => entry.term.toLowerCase());
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, "en")));
  });
});

const ids = () => GLOSSARY.map((entry) => entry.id);

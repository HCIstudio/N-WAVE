import { describe, it, expect, beforeEach } from "vitest";
import { demoStore, DemoStoreError } from "./demoStore";
import { DEMO_WORKFLOW_ID } from "./demoWorkflow";

beforeEach(() => {
  localStorage.clear();
});

describe("demoStore", () => {
  it("always lists the read-only built-in demo first", () => {
    const list = demoStore.list();
    expect(list.length).toBe(1);
    expect(list[0]._id).toBe(DEMO_WORKFLOW_ID);
    expect(list[0].isReadOnly).toBe(true);
  });

  it("creates, reads back, and lists a new workflow", () => {
    const created = demoStore.create({ name: "My Flow" });
    expect(created._id).toBeTruthy();
    expect(created.name).toBe("My Flow");

    const fetched = demoStore.get(created._id);
    expect(fetched?.name).toBe("My Flow");

    const names = demoStore.list().map((w) => w.name);
    expect(names).toContain("My Flow");
  });

  it("updates an existing workflow", () => {
    const created = demoStore.create({ name: "Before" });
    const updated = demoStore.update(created._id, { name: "After" });
    expect(updated.name).toBe("After");
    expect(demoStore.get(created._id)?.name).toBe("After");
  });

  it("deletes a workflow", () => {
    const created = demoStore.create({ name: "Temp" });
    demoStore.remove(created._id);
    expect(demoStore.get(created._id)).toBeNull();
  });

  it("duplicates the built-in demo into an editable copy", () => {
    const copy = demoStore.duplicate(DEMO_WORKFLOW_ID);
    expect(copy.name).toBe("Demo Workflow Copy");
    expect(copy.isReadOnly).toBe(false);
    expect(copy._id).not.toBe(DEMO_WORKFLOW_ID);
    // the copy keeps the graph
    expect(copy.nodes.length).toBeGreaterThan(0);
  });

  it("refuses to modify or delete the read-only built-in", () => {
    expect(() => demoStore.update(DEMO_WORKFLOW_ID, { name: "x" })).toThrow(
      DemoStoreError
    );
    expect(() => demoStore.remove(DEMO_WORKFLOW_ID)).toThrow(DemoStoreError);
  });

  it("persists workflows across store reads (localStorage-backed)", () => {
    demoStore.create({ name: "Persisted" });
    // A fresh read goes back to localStorage.
    const names = demoStore.list().map((w) => w.name);
    expect(names).toContain("Persisted");
  });
});

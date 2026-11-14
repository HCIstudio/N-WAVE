import { expect, test } from "./fixtures";

// Runs of the examples recorded on an installation (src/demo/recordedRuns):
// the demo can't run workflows, but shows what came of a real run.
test.describe("a recorded run in the demo", () => {
  test("History shows Demo 1's recorded run, with the bytes each step read and wrote", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    await page.getByRole("region", { name: "Runs" }).getByRole("button", { name: "Expand run panel" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await panel.getByRole("tab", { name: "History" }).click();
    await panel.getByRole("list", { name: "Earlier runs" }).getByRole("button").first().click();
    await panel.getByText("Time, memory and bytes per step").click();

    // From the recorded trace: MERGE read 64673 bytes (rchar) and wrote 3276 (wchar).
    const table = panel.getByRole("table", { name: "Steps by time" });
    await expect(table.getByRole("columnheader", { name: "Read" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Wrote" })).toBeVisible();
    const merge = table.getByRole("row").filter({ hasText: "Merge" });
    await expect(merge).toContainText("63.2 KB");
    await expect(merge).toContainText("3.2 KB4.0 KB to disk");
  });

  test("Show on canvas puts the run on the nodes: their Results start with the trace's line", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    await page.getByRole("region", { name: "Runs" }).getByRole("button", { name: "Expand run panel" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await panel.getByRole("tab", { name: "History" }).click();
    await panel.getByRole("list", { name: "Earlier runs" }).getByRole("button").first().click();
    await panel.getByRole("button", { name: "Show on canvas" }).click();

    // The Performance tab shows the run, the run's total in its first line.
    await expect(panel.getByRole("tab", { name: "Performance" })).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByTestId("run-performance-summary")).toContainText("5 tasks · read 435.5 KB, wrote 12.4 KB");

    await panel.getByRole("button", { name: "Minimize run panel" }).click();
    // From the recorded trace: MAP read 63377 bytes and wrote 1922.
    await page.locator('.react-flow__node[data-id="demo-map-uppercase"]').dblclick();
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(page.getByTestId("node-trace-line")).toHaveText("1 task, < 1 s, read 61.9 KB, wrote 1.9 KB");
    // The demo keeps the run's numbers, not its files.
    await expect(page.getByText(/keeps its numbers, not its files/)).toBeVisible();
  });

  test("Demo 3's recorded run: STAR alignment read and wrote the most", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 3 - nf-core\/rnaseq rebuilt from nodes/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    await page.getByRole("region", { name: "Runs" }).getByRole("button", { name: "Expand run panel" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await panel.getByRole("tab", { name: "History" }).click();
    await panel.getByRole("list", { name: "Earlier runs" }).getByRole("button").first().click();
    await panel.getByRole("button", { name: "Show on canvas" }).click();

    // From the recorded trace, the four STAR_ALIGNMENT tasks together.
    const table = panel.getByRole("table", { name: "Steps by time" });
    const star = table.getByRole("row").nth(1);
    await expect(star).toContainText("STAR alignment");
    await expect(star).toContainText("223.5 MB14.5 MB from disk");
    await expect(star).toContainText("205.3 MB38.3 MB to disk");
  });

  test("the I/O monitor's record of Demo 1: what it recorded, and how much of it is linked to steps", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.getByRole("region", { name: "Runs" }).getByRole("button", { name: "Expand run panel" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await panel.getByRole("tab", { name: "History" }).click();
    await panel.getByRole("list", { name: "Earlier runs" }).getByRole("button").first().click();
    await panel.getByRole("button", { name: "Show on canvas" }).click();

    // From the recording: monitor.json and the accesses linked to the run's 5 tasks.
    const note = panel.getByTestId("run-monitor-note");
    await expect(note).toContainText("The I/O monitor recorded 2263 file accesses and 1385 process starts");
    await expect(panel.getByTestId("run-monitor-linked")).toHaveText(
      "216 of 2263 recorded accesses are linked to steps; not linked: 1137 by processes outside the steps' containers (Nextflow, Docker), 543 by processes started before the monitor, 367 to files whose opening the monitor didn't record.",
    );
    // It also says that it missed some: the run's check for lost events.
    await expect(note.getByRole("alert")).toContainText("For 6 of the 26 files the run wrote");
  });
});

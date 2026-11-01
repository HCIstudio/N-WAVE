import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { addNode, expect, test } from "./fixtures";

// Verbose mode: record a marked test with a participant, then export only that test.
test("records a marked test and exports it on its own", async ({ page }) => {
  await page.goto("./settings");
  const section = page.getByRole("region", { name: "Verbose mode", exact: true });
  const marker = page.getByRole("region", { name: "Verbose mode recording" });
  await expect(page.getByText(/^Recording/)).toHaveCount(0);

  await page.getByLabel(/Record what happens/).check();
  await expect(marker).toContainText("Recording");
  await page.getByLabel("Participant ID (this browser)").fill("P07");
  await page.getByLabel("Participant ID (this browser)").press("Enter");
  await expect(marker).toContainText("Recording · P07");

  // Something before the test, which its export leaves out.
  await page.getByRole("link", { name: "Workflows" }).click();
  await page.getByRole("button", { name: "Start test" }).click();
  await page.getByLabel("Test label (optional)").fill("Task 1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(marker).toContainText("Test “Task 1”");

  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await addNode(page, "Display Output");
  await page.getByRole("button", { name: "End test" }).click();
  await expect(marker).not.toContainText("Test");

  await page.goto("./settings");
  const testChoice = section.getByLabel("Test to export");
  await expect(testChoice.locator("option", { hasText: "Task 1" })).toHaveCount(1);
  await testChoice.selectOption({ index: 1 });
  const download = page.waitForEvent("download");
  await section.getByRole("button", { name: "Download ZIP" }).click();
  const file = await (await download).path();
  const zip = unzipSync(new Uint8Array(readFileSync(file)));
  expect(Object.keys(zip).sort()).toEqual(["README.txt", "events.csv", "events.jsonl"]);
  const events = strFromU8(zip["events.jsonl"])
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; test?: string; participant?: string; data?: { label?: string } });
  const types = events.map((event) => event.type);
  expect(types[0]).toBe("test.started");
  expect(types[types.length - 1]).toBe("test.ended");
  expect(types).toContain("node.added");
  expect(types).toContain("ui.click");
  expect(new Set(events.map((event) => event.test)).size).toBe(1);
  expect(events.every((event) => event.participant === "P07")).toBe(true);
  expect(events[0].data?.label).toBe("Task 1");
});

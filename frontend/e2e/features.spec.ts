import type { Locator, Page } from "@playwright/test";
import { canvasSettled, expect, test } from "./fixtures";

// Global Settings → Features: a switched-off feature is hidden everywhere,
// and workflows still open.

const features = (page: Page) => page.getByRole("region", { name: "Features" });

const switchOff = async (page: Page, label: string) => {
  const box = features(page).getByRole("checkbox", { name: new RegExp(`^${label}`) });
  await box.uncheck();
  await expect(box).not.toBeChecked();
};

test("switched-off features are hidden, and workflows that use them still open", async ({ page }) => {
  await page.goto("./settings");
  for (const label of ["Templates and built-in examples", "Custom code", "Node packs", "Glossary and Help", "Run profiles"]) {
    await switchOff(page, label);
  }
  await features(page).getByRole("radio", { name: /^Off/ }).check();
  await expect(page.getByRole("link", { name: "Help" })).toHaveCount(0);

  // Kept after a reload.
  await page.reload();
  await expect(features(page).getByRole("checkbox", { name: /^Custom code/ })).not.toBeChecked();
  await expect(features(page).getByRole("radio", { name: /^Off/ })).toBeChecked();

  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(page.getByRole("heading", { name: "Workflows", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Built-in demos" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Help" })).toHaveCount(0);

  // New Workflow starts empty, without the template choice.
  await page.getByRole("button", { name: "New Workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await expect(page.getByRole("button", { name: /^Workflow check/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Help" })).toHaveCount(0);

  await page.getByRole("button", { name: "Add node" }).click();
  await expect(page.getByRole("button", { name: "nf-core Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom process" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Node packs" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Execution Settings" }).click();
  await expect(page.getByRole("button", { name: "Execution", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Profiles" })).toHaveCount(0);

  // A built-in example still opens by its link.
  await page.goto("./workflow/builtin:demo-basic");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
});

const handle = (page: Page, nodeId: string, type: "source" | "target", name: string): Locator =>
  page.locator(`[data-id="${nodeId}"] .react-flow__handle.${type}[data-handleid="${name}"]`);

test("without connection hints, inputs aren't marked while dragging", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("https://raw.githubusercontent.com/nf-core/modules/**", (route) =>
    route.fulfill({ contentType: "text/plain", body: "process STAND_IN {\n}\n" }),
  );
  await page.goto("./settings");
  await switchOff(page, "Connection hints");

  await page.goto("./workflow/builtin:rnaseq-star-salmon");
  const banner = page.getByRole("alert", { name: "Missing nf-core components" });
  await banner.getByRole("button", { name: "Install them" }).click();
  await expect(banner).toHaveCount(0, { timeout: 60_000 });
  await canvasSettled(page);

  const box = await handle(page, "reference", "source", "fasta").boundingBox();
  if (!box) throw new Error("handle is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  await expect(handle(page, "star_index", "target", "gtf")).not.toHaveAttribute("data-fit", /.*/);
  await expect(handle(page, "star_index", "target", "fasta")).not.toHaveAttribute("data-fit", /.*/);
  await page.mouse.up();
});

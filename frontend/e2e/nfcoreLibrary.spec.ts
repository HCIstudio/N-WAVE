import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const nameField = (page: Page) =>
  page.getByRole("textbox", { name: "Name", exact: true }).first();

// Module sources come from GitHub in the demo; serve a stand-in so the test
// doesn't depend on the network.
const stubGitHub = async (page: Page) => {
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: "process SALMON_QUANT {\n    input:\n    tuple val(meta), path(reads)\n}\n",
    })
  );
};

const openNodeMenu = async (page: Page) => {
  await page.getByRole("button", { name: "Add node" }).click();
};

test.describe("demo nf-core library and custom nodes", () => {
  test("installs a module that survives a reload", async ({ page }) => {
    await stubGitHub(page);
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    await openNodeMenu(page);
    await expect(
      page.getByText("Installed nf-core nodes unavailable.")
    ).toHaveCount(0);
    await page.getByRole("button", { name: "nf-core Library" }).click();
    await expect(page.getByText(/Modules install into this browser/)).toBeVisible();

    await page.getByPlaceholder("Search nf-core modules...").fill("salmon/quant");
    await page
      .getByRole("button", { name: "Install nf-core/salmon/quant" })
      .click();
    await expect(page.getByText("Installed nf-core/salmon/quant.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove nf-core/salmon/quant" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Close nf-core library" }).click();

    // The node menu stays open with the new module in it.
    await page.getByRole("button", { name: /^salmon_quant/ }).first().click();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);

    // Autosave (2s debounce), then reload: the node and its code are kept.
    await page.waitForTimeout(3000);
    await page.reload();
    const node = page.locator(".react-flow__node").first();
    await expect(node).toContainText("salmon_quant");
    await node.dblclick();
    await page.getByRole("tab", { name: "Code" }).click();
    await expect(page.getByLabel("Module code", { exact: true })).toContainText(
      "process SALMON_QUANT"
    );
    await expect(
      page.getByLabel("Include statement", { exact: true })
    ).toContainText("./modules/nf-core/salmon/quant/main");
  });

  test("creates, edits and deletes a custom node", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    await openNodeMenu(page);
    await page.getByRole("button", { name: "Custom process" }).click();
    await nameField(page).fill("Head lines");
    await page.getByRole("button", { name: "Save Node" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Custom Node" })
    ).toHaveCount(0);

    // The node menu stays open with the new node in it.
    await page.getByRole("button", { name: /^Head lines/ }).first().click();
    await expect(page.locator(".react-flow__node").first()).toContainText(
      "Head lines"
    );

    // Autosave (2s debounce) before reloading.
    await page.waitForTimeout(3000);

    await page.reload();
    await expect(page.locator(".react-flow__node").first()).toContainText(
      "Head lines"
    );

    // Edit it from the node menu.
    await openNodeMenu(page);
    await page.getByRole("button", { name: "Edit Head lines" }).click();
    await nameField(page).fill("First lines");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.locator(".react-flow__node").first()).toContainText(
      "First lines"
    );

    await page.reload();
    await openNodeMenu(page);
    await expect(
      page.getByRole("button", { name: "Delete First lines" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete First lines" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await page.reload();
    await openNodeMenu(page);
    await expect(
      page.getByRole("button", { name: /^First lines/ })
    ).toHaveCount(0);
  });
});

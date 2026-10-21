import { expect, test } from "./fixtures";

test.describe("templates and glossary", () => {
  test("a new workflow starts from the QC template, ready to install and run", async ({ page }) => {
    // Installing fetches each module's main.nf from GitHub: serve stand-ins.
    await page.route("https://raw.githubusercontent.com/nf-core/modules/**", (route) =>
      route.fulfill({ contentType: "text/plain", body: "process STAND_IN {\n}\n" }),
    );
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("dialog", { name: "Start a new workflow" }).getByRole("button", { name: "QC of FASTQ files" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const banner = page.getByRole("alert", { name: "Missing nf-core components" });
    await banner.getByRole("button", { name: "Install them" }).click();
    await expect(banner).toHaveCount(0, { timeout: 60_000 });
    for (const label of ["Samplesheet", "FastQC", "MultiQC"]) {
      await expect(page.locator(".react-flow__node").filter({ hasText: label }).first()).toBeVisible();
    }
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);

    // The samplesheet's panel explains its terms.
    await page.locator(".react-flow__node").filter({ hasText: "Samplesheet" }).first().dblclick();
    const tuple = page.getByRole("button", { name: "About “Tuple”" });
    await tuple.hover();
    const card = page.getByRole("dialog", { name: "Tuple" });
    await expect(card).toContainText("Several values that travel together");
    await expect(card.getByRole("link", { name: "All terms in the glossary" })).toHaveAttribute(
      "href",
      /\/glossary#tuple$/,
    );
  });

  test("a new workflow can be an editable copy of a demo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page
      .getByRole("dialog", { name: "Start a new workflow" })
      .getByRole("button", { name: "Demo 1 - Text basics" })
      .click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page).not.toHaveURL(/builtin:/);
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
  });

  test("the glossary lists the terms, and the home page links to it", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: "Glossary" }).click();
    await expect(page.getByRole("heading", { name: "Glossary" })).toBeVisible();
    await expect(page.getByRole("term")).toHaveCount(25);
    await page.getByPlaceholder("Search terms...").fill("sample");
    await expect(page.getByRole("term").filter({ hasText: "Samplesheet" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Docker" })).toHaveCount(0);
  });
});

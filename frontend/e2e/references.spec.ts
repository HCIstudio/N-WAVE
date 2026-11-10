import { expect, test } from "./fixtures";

test("the home page's footer links to the references, each with where N-WAVE uses it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("contentinfo").getByRole("link", { name: "References" }).click();
  await expect(page).toHaveURL(/\/references$/);
  await expect(page.getByRole("heading", { level: 1, name: "References" })).toBeVisible();
  const list = page.getByRole("list", { name: "References" });
  await expect(list.getByRole("article")).toHaveCount(5);
  const metamodel = list.getByRole("article", { name: /Consolidated View on Specification Languages/ });
  await expect(metamodel).toContainText("doi:10.1007/978-3-031-19756-7_12");
  await expect(metamodel).toContainText("Export and import as a DAW model");
});

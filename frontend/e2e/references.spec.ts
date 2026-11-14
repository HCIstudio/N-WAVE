import { expect, test } from "./fixtures";

test("the home page's footer links to the references, each with where N-WAVE uses it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("contentinfo").getByRole("link", { name: "References" }).click();
  await expect(page).toHaveURL(/\/references$/);
  await expect(page.getByRole("heading", { level: 1, name: "References" })).toBeVisible();
  const list = page.getByRole("list", { name: "References" });
  await expect(list.getByRole("article")).toHaveCount(7);
  const metamodel = list.getByRole("article", { name: /Consolidated View on Specification Languages/ });
  await expect(metamodel).toContainText("doi:10.1007/978-3-031-19756-7_12");
  await expect(metamodel).toContainText("Export and import as a DAW model");
  // v1.7: the I/O monitoring and BottleMod papers.
  const monitoring = list.getByRole("article", { name: /Low-level I\/O Monitoring for Scientific Workflows/ });
  await expect(monitoring).toContainText("doi:10.48550/arXiv.2408.00411");
  await expect(monitoring).toContainText("The I/O monitor next to a run");
  const bottlemod = list.getByRole("article", { name: /BottleMod: Modeling Data Flows/ });
  await expect(bottlemod).toContainText("doi:10.1145/3676151.3719382");
  await expect(bottlemod).toContainText("What if? Predicted runtime with other resources");
});

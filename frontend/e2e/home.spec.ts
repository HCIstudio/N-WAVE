import { expect, test } from "./fixtures";

test("the home page separates the built-in demos from your workflows", async ({
  page,
}) => {
  await page.goto("./");
  const demos = page.getByRole("region", { name: "Built-in demos" });
  await expect(demos.getByRole("link")).toHaveCount(3);
  await expect(demos.getByRole("link").nth(0)).toContainText("Demo 1 - Text basics");
  await expect(demos.getByRole("link").nth(1)).toContainText("Demo 2 - nf-core/rnaseq pipeline");
  await expect(demos.getByRole("link").nth(2)).toContainText(
    "Demo 3 - nf-core/rnaseq rebuilt from nodes"
  );
  // Every card says how big it is, whether it's read-only and when it changed.
  const first = demos.getByRole("list", { name: "About this workflow" }).first();
  await expect(first.getByRole("listitem")).toHaveText([
    "6 nodes",
    "Read-only",
    /^Changed /,
  ]);

  const own = page.getByRole("region", { name: "Your workflows" });
  await expect(own).toContainText("You haven't created any workflows yet.");
  await own.getByRole("button", { name: "New Workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await page.getByRole("link", { name: "Home" }).click();
  const card = own.getByRole("link");
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("listitem")).toHaveText(["0 nodes", /^Changed /]);
});

import { addNode, connect, expect, fitView, moveNode, test } from "./fixtures";

test.describe("workflow check", () => {
  test("blocks the run until the File Input has a file, and points at the node", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -450, 0);
    const filter = await addNode(page, "Filter");
    const output = await addNode(page, "Display Output");
    await fitView(page);
    await connect(page, input, filter);
    await connect(page, filter, output);

    // Blocked, with the reason on Run and on the node.
    const run = page.getByRole("button", { name: "Run Workflow" });
    await expect(run).toBeDisabled();
    await expect(run).toHaveAttribute("title", /Can't run yet: Add a file to “File Input”/);
    await expect(input.getByRole("img", { name: /^Problem: Add a file to “File Input”/ })).toBeVisible();

    // A node that isn't connected is only a warning.
    const merge = await addNode(page, "Merge");
    await expect(merge.getByRole("img", { name: /^Warning: “Merge” isn't connected/ })).toBeVisible();

    const check = page.getByRole("button", { name: /^Workflow check:/ });
    await expect(check).toHaveAccessibleName("Workflow check: 1 problem to fix before running, 1 warning");
    await check.click();
    const list = page.getByRole("region", { name: "Workflow check" });
    await expect(list).toContainText("Add a file to “File Input”: it has nothing to pass on.");
    await expect(list).toContainText("“Merge” isn't connected to anything");
    await list.getByRole("button", { name: "Show “File Input”" }).click();
    await expect(list).toHaveCount(0);
    await expect(input).toHaveClass(/selected/);

    // With a file, the workflow can run; the warning stays.
    await input.locator('input[type="file"]').setInputFiles({
      name: "greetings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world\n"),
    });
    await expect(run).toBeEnabled();
    await expect(input.getByRole("img")).toHaveCount(0);
    await expect(check).toHaveAccessibleName("Workflow check: 1 warning");
  });
});

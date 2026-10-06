import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("node code view", () => {
  test("shows a node's code and converts it to an editable custom node", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -350, 0);
    const filter = await addNode(page, "Filter");
    await input.locator('input[type="file"]').setInputFiles({
      name: "greetings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world\ngoodbye world\n"),
    });
    await connect(page, input, filter);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    await filter.dblclick();
    await page.getByRole("tab", { name: "Code" }).click();
    const processCode = page.getByLabel("Process code", { exact: true });
    await expect(processCode).toContainText(/process \w+ \{/);
    await expect(page.getByLabel("Workflow code", { exact: true })).toContainText(
      "in_ch"
    );

    await page.getByRole("button", { name: "Convert to custom node" }).click();
    await expect(page.getByText(/Converted ".*" to a custom node/)).toBeVisible();

    // The node keeps its connection and now offers the custom node editor.
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(filter).toContainText("Custom node");
    await expect(
      page.getByRole("button", { name: "Edit custom node" })
    ).toBeVisible();
    await expect(processCode).toContainText(/process custom_filter_\w+ \{/);

    await page.getByRole("button", { name: "Edit custom node" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit Custom Node" })
    ).toBeVisible();
  });

  test("offers Custom process instead of the empty Process node", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Add node" }).click();
    await expect(
      page.getByRole("button", { name: "Custom process" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Process\b/ })).toHaveCount(
      0
    );
  });
});

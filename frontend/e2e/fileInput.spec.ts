import { addNode, connect, expect, fitView, moveNode, test } from "./fixtures";

// A file added to a File Input that is already connected keeps the connection.
test("adding a file to a connected File Input keeps its connection", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);

  const input = await addNode(page, "File Input");
  await moveNode(page, input, -450, 0);
  const map = await addNode(page, "Map");
  await fitView(page);
  await connect(page, input, map);
  const edges = page.locator(".react-flow__edge");
  await expect(edges).toHaveCount(1);

  await input.locator('input[type="file"]').setInputFiles({
    name: "greetings.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello world\n"),
  });
  await expect(input).toContainText("1 file");
  await expect(edges).toHaveCount(1);
});

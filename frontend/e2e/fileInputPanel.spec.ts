import { addNode, expect, test } from "./fixtures";

test.describe("File Input panel", () => {
  test("adds files from the picker and by dropping them", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const input = await addNode(page, "File Input");
    await input.dblclick();

    // "Add Files" opens the file picker.
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add Files" }).click();
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles({
      name: "a.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello\n"),
    });
    await expect(input).toContainText("1 file selected");
    await expect(page.getByText("a.txt").first()).toBeVisible();

    // Files dropped on the list are added too.
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["bye\n"], "b.txt", { type: "text/plain" }));
      return transfer;
    });
    const dropZone = page.getByText("a.txt").first();
    await dropZone.dispatchEvent("dragenter", { dataTransfer });
    await dropZone.dispatchEvent("dragover", { dataTransfer });
    await dropZone.dispatchEvent("drop", { dataTransfer });
    await expect(input).toContainText("2 files selected");
    await expect(page.getByText("b.txt").first()).toBeVisible();
  });
});

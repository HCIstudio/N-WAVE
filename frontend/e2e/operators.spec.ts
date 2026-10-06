import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("operator nodes", () => {
  test("subtitles, filtering and autosave react to edits without render loops", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const input = await addNode(page, "File Input");
    await moveNode(page, input, -450, 0);
    const filter = await addNode(page, "Filter");
    await moveNode(page, filter, -100, 0);
    const output = await addNode(page, "Display Output");
    await moveNode(page, output, 250, 0);

    await input.locator('input[type="file"]').setInputFiles({
      name: "greetings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world\ngoodbye world\nhello again\n"),
    });
    await expect(input).toContainText("1 file");

    // A connected filter picks up the file and shows it in its subtitle.
    await connect(page, input, filter);
    await expect(filter).toContainText(/1 file/);

    await connect(page, filter, output);
    await expect(output).toContainText("1 file received");

    // Editing the filter text updates the filtered output.
    await filter.dblclick();
    await page.getByLabel(/filter text/i).fill("hello");
    await expect(filter).not.toContainText("(unedited)");

    // Autosave (2s debounce) persists the graph without pressing Save.
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);

    expect(errors.filter((e) => /Maximum update depth|Too many re-renders/.test(e))).toEqual([]);
  });
});

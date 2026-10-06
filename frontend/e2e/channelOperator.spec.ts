import { addNode, expect, moveNode, test } from "./fixtures";

test.describe("channel operator node", () => {
  test("applies a template, validates the code and shows the generated statements", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    const operator = await addNode(page, "Channel Operator");
    await moveNode(page, operator, -200, 0);
    await expect(operator).toContainText("Join by sample");

    await operator.dblclick();
    await page.getByLabel("Template").selectOption("branch");
    await expect(operator).toContainText("Branch");
    // The template's ports: one input, two outputs.
    await expect(operator.locator(".react-flow__handle.target")).toHaveCount(1);
    await expect(operator.locator(".react-flow__handle.source")).toHaveCount(2);

    const code = page.getByLabel("Channel code");
    await expect(code).toHaveValue(/local\.branched = input\.in\.branch/);
    await code.fill("output.single = input.reads");
    const problems = page.getByLabel("Channel operator problems");
    await expect(problems).toContainText("input.reads isn't an input of this node.");
    await expect(problems).toContainText("output.paired is never assigned");

    await code.fill(
      "output.single = input.in.filter { meta, reads -> meta.single_end }\noutput.paired = input.in.filter { meta, reads -> !meta.single_end }"
    );
    await expect(problems).toHaveCount(0);

    // The Code tab shows the statements, with placeholder input channels.
    await page.getByRole("tab", { name: "Code" }).click();
    await expect(page.getByLabel("Workflow code", { exact: true })).toContainText(
      "= in_ch.filter { meta, reads -> meta.single_end }"
    );
  });
});

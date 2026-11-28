import { addNode, canvasSettled, connectHandles, expect, moveNode, test } from "./fixtures";

test.describe("channel operator node", () => {
  test("applies a template, validates the code and shows the generated statements", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
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

// A step that emits [id, file] items, filtered by id: the filter shows as a
// form, and a Flat map from the node menu fits its code to those items.
const SPLIT_SCRIPT = `process SPLIT {
    input:
    path stack

    output:
    tuple val(id), path("*.tif"), emit: tifs

    script:
    id = stack.baseName
    """
    cp ${"$"}{stack} ${"$"}{id}.tif
    """
}

process USE {
    input:
    tuple val(id), path(tif)

    output:
    stdout emit: out

    script:
    """
    echo ${"$"}{id}
    """
}

workflow {
    ch_tifs = SPLIT(channel.fromPath(params.stacks)).tifs
    ch_gv = ch_tifs.filter { id, _tif -> id == 'gv' }
    USE(ch_gv)
}
`;

test("a filter's condition is a form, and templates fit the connected items", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Import Workflow" }).click();
  await page.getByLabel("Nextflow File, Project Zip, Folder or DAW Model").setInputFiles({
    name: "split.nf",
    mimeType: "text/plain",
    buffer: Buffer.from(SPLIT_SCRIPT),
  });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await canvasSettled(page);

  // Named by the script, with what it does below the name.
  const filter = page.locator(".react-flow__node", { hasText: "ch_gv" });
  await expect(filter).toContainText("filter · id == 'gv'");
  await filter.dblclick();
  const form = page.getByRole("group", { name: "Keep the items where" });
  await expect(form).toContainText("id, tif");
  await expect(form.getByLabel("Part")).toHaveValue("id");
  await form.getByLabel("Value").fill("nir");
  await form.getByLabel("Value").press("Enter");
  await expect(page.getByLabel("Channel code")).toHaveValue("output.ch_gv = input.ch_tifs.filter { id, _tif -> id == 'nir' }");
  await form.getByLabel("Comparison").selectOption("isNot");
  await expect(page.getByLabel("Channel code")).toHaveValue("output.ch_gv = input.ch_tifs.filter { id, _tif -> id != 'nir' }");
  await page.getByRole("button", { name: "Close Panel" }).click();

  // A Flat map from the menu, connected to the step's [id, tif] items.
  const flatMap = await addNode(page, "Flat map");
  await moveNode(page, flatMap, 0, 200);
  const split = page.locator(".react-flow__node", { hasText: "SPLIT" });
  await connectHandles(page, split.locator('.react-flow__handle.source[data-handleid="tifs"]'), flatMap.locator(".react-flow__handle.target"));
  await flatMap.dblclick();
  const code = page.getByLabel("Channel code");
  await expect(code).toHaveValue(/input\.in\.flatMap \{ meta, files ->/);
  await page.getByRole("button", { name: "Fit the code to them" }).click();
  await expect(code).toHaveValue("output.out = input.in.flatMap { id, tif ->\n    tif.collect { item -> [ id, item ] }\n}");
  await expect(page.getByRole("button", { name: "Fit the code to them" })).toHaveCount(0);
});

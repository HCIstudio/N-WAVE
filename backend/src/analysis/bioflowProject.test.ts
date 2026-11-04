import { describe, expect, it } from "vitest";
import { buildAnalysisProject, isProjectPath } from "./bioflowProject";

describe("isProjectPath", () => {
  it.each(["main.nf", "modules/local/x/main.nf", "nextflow.config"])("accepts %s", (file) => {
    expect(isProjectPath(file)).toBe(true);
  });
  it.each(["", "/etc/passwd", "../x.nf", "a/../../b.nf", "a\\b.nf", "a//b.nf"])("refuses %s", (file) => {
    expect(isProjectPath(file)).toBe(false);
  });
});

describe("buildAnalysisProject", () => {
  it("writes the script as main.nf without N-WAVE's config blocks", async () => {
    const script = "/* N-WAVE_NEXTFLOW_CONFIG\nprocess.cpus = 2\n*/\nworkflow {\n}\n";
    const project = await buildAnalysisProject(script, { "modules/local/a/main.nf": "process A {}" });
    expect(project.entry).toBe("main.nf");
    // The settings comment's lines stay, empty, so lines match the script sent.
    expect(project.files["main.nf"]).toBe("\n\n\nworkflow {\n}\n");
    expect(project.files["modules/local/a/main.nf"]).toBe("process A {}");
  });

  it("keeps the script over a sent main.nf, and refuses files outside the project", async () => {
    expect((await buildAnalysisProject("workflow {}", { "main.nf": "other" })).files["main.nf"]).toBe("workflow {}");
    await expect(buildAnalysisProject("workflow {}", { "../x.nf": "" })).rejects.toThrow("inside the project");
  });
});

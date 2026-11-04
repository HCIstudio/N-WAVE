import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAnalysisProject } from "./bioflowProject";
import { parseBioflowResult } from "./bioflowResult";
import {
  BIOFLOW_IMAGE_REPOSITORY,
  BioflowUnavailableError,
  buildBioflowDockerArgs,
  getBioflowStatus,
  readBioflowConfig,
  runBioflowAnalysis,
} from "./bioflowRunner";

describe("readBioflowConfig", () => {
  it("uses the image of N-WAVE's version, 120 s and on by default", () => {
    const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
    expect(readBioflowConfig({})).toEqual({
      enabled: true,
      image: `${BIOFLOW_IMAGE_REPOSITORY}:${version}`,
      timeoutSeconds: 120,
    });
  });

  it("reads the switch, the image and the time limit", () => {
    expect(
      readBioflowConfig({ NWAVE_BIOFLOW: "off", NWAVE_BIOFLOW_IMAGE: "local/bioflow:dev", NWAVE_BIOFLOW_TIMEOUT: "30" })
    ).toEqual({ enabled: false, image: "local/bioflow:dev", timeoutSeconds: 30 });
    expect(readBioflowConfig({ NWAVE_BIOFLOW_TIMEOUT: "soon" }).timeoutSeconds).toBe(120);
  });
});

describe("buildBioflowDockerArgs", () => {
  it("runs the image without network, read-only, without capabilities, with limits", () => {
    const args = buildBioflowDockerArgs("img:1", "nwave-bioflow-x").join(" ");
    for (const part of [
      "--network none",
      "--read-only",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "--memory 2g",
      "--pull never",
      "--name nwave-bioflow-x",
    ]) {
      expect(args).toContain(part);
    }
    // No mounts: the project goes in on stdin.
    expect(args).not.toMatch(/(^| )(-v|--volume|--mount|--volumes-from)( |$)/);
    expect(args.endsWith("img:1 --stdin")).toBe(true);
  });
});

describe("when the analysis is switched off", () => {
  const off = { enabled: false, image: "img:1", timeoutSeconds: 120 };

  it("says why", async () => {
    expect(await getBioflowStatus(off)).toMatchObject({ available: false, reason: expect.stringContaining("NWAVE_BIOFLOW=off") });
  });

  it("refuses to run", async () => {
    await expect(runBioflowAnalysis({ entry: "main.nf", files: {} }, off)).rejects.toBeInstanceOf(BioflowUnavailableError);
  });
});

// With a built image (BIOFLOW_IMAGE_TEST=nwave-bioflow:dev), the whole way
// through Docker: the result equals the contract test's recording.
const image = process.env.BIOFLOW_IMAGE_TEST;
describe.skipIf(!image)("with the analysis image", () => {
  const projectDir = path.join(__dirname, "..", "..", "bioflow", "tests", "projects", "subworkflows");
  const readFiles = (folder: string, prefix = ""): Record<string, string> =>
    Object.fromEntries(
      fs.readdirSync(path.join(folder, prefix), { withFileTypes: true }).flatMap((entry) => {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory()
          ? Object.entries(readFiles(folder, relative))
          : [[relative, fs.readFileSync(path.join(folder, relative), "utf8")]];
      })
    );

  it("analyses a project sent on stdin", async () => {
    const { "main.nf": script, ...files } = readFiles(projectDir);
    const project = await buildAnalysisProject(script ?? "", files);
    const config = { enabled: true, image: image ?? "", timeoutSeconds: 300 };
    const result = await runBioflowAnalysis(project, config);
    const expected = parseBioflowResult(
      fs.readFileSync(path.join(projectDir, "..", "..", "expected", "subworkflows.json"), "utf8")
    );
    expect(result).toEqual(expected);
  }, 600_000);
});

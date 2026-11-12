import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import type { BioflowResult } from "../analysis/bioflow";
import { conditionsByNode } from "../analysis/conditions";
import { lineOwners } from "../analysis/scriptLines";
import { groupFrames } from "../canvas/canvasViews";
import type { NodeData } from "../components/nodes/BaseNode";
import { demoWorkflowSeed } from "../demo/demoWorkflow";
import { nodeIdForProcess, summarizeNodeRuns } from "../execution/nodeRuns";
import { generateNextflowScript, generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { checkWorkflow } from "../pages/workflow/workflowCheck";
import catalog from "../registry/nfcore/catalog.json";
import { registerDynamicNodeDefinitions } from "../registry/nodeDefinitions";
import { importNextflowScript, type NfCoreCatalogForImport } from "../workflows/import/importScript";
import {
  contractedEdges,
  groupName,
  groupProblem,
  groupsOf,
  groupTitle,
  isGroupable,
  renamedGroup,
  withGroup,
  withoutGroup,
} from "./groups";
import { inlineGroups, withGroupSelectors, withoutGroupSelectors } from "./inlineGroups";
import { groupSuggestions } from "./suggestions";

// Demo 1: a File Input read by two filters, one of them followed by Map; Merge, Display Output.
const demo = () => ({
  nodes: structuredClone(demoWorkflowSeed.nodes) as Node<NodeData>[],
  edges: structuredClone(demoWorkflowSeed.edges) as Edge[],
});
const BRANCH = ["demo-filter-barry", "demo-map-uppercase"];
const generate = (nodes: Node<NodeData>[], edges: Edge[]) => generateNextflowScript(nodes, edges, "Demo", "results");
const workflowBlock = (script: string, name: string) =>
  script.slice(script.indexOf(`workflow ${name} {`), script.indexOf("\n}\n", script.indexOf(`workflow ${name} {`)) + 2);

describe("groups", () => {
  it("are of steps only, and named for the code", () => {
    const { nodes } = demo();
    expect(nodes.filter(isGroupable).map((node) => node.id)).toEqual([
      "demo-filter-barry",
      "demo-map-uppercase",
      "demo-filter-bee",
      "demo-merge",
    ]);
    expect(groupName("Read QC (2)")).toBe("READ_QC_2");
    expect(groupName("2 aligners")).toBe("GROUP_2_ALIGNERS");
    expect(groupTitle("READ_QC")).toBe("Read Qc");
  });

  it("say why steps can't be grouped", () => {
    const { nodes, edges } = demo();
    expect(groupProblem(nodes, edges, BRANCH, "BRANCH")).toBeNull();
    expect(groupProblem(nodes, edges, BRANCH, "2x")).toMatch(/letter first/);
    expect(groupProblem(nodes, edges, BRANCH, "MERGE", new Set(["MERGE"]))).toMatch(/already the name/);
    expect(groupProblem(nodes, edges, ["demo-file-input", "demo-filter-barry"], "G")).toMatch(/is not a step/);
    // Filter → Map → Merge without Map: data leaves the group at Filter and comes back at Merge.
    expect(groupProblem(nodes, edges, ["demo-filter-barry", "demo-merge"], "G")).toMatch(/come back into it/);
  });

  it("are added, renamed and removed on the steps' data", () => {
    const grouped = withGroup(demo().nodes, BRANCH, "BRANCH");
    expect([...groupsOf(grouped).keys()]).toEqual(["BRANCH"]);
    expect(groupsOf(renamedGroup(grouped, "BRANCH", "OTHER")).get("OTHER")?.map((node) => node.id)).toEqual(BRANCH);
    expect(groupsOf(withoutGroup(grouped, "BRANCH")).size).toBe(0);
    expect(contractedEdges(grouped, demo().edges).map((edge) => `${edge.source}->${edge.target}`)).toContain("group:BRANCH->demo-merge");
  });
});

describe("a group in the code", () => {
  const { nodes, edges } = demo();
  const grouped = withGroup(nodes, BRANCH, "BARRY_UPPERCASE");
  const script = generate(grouped, edges);

  it("is a named workflow: what comes in its takes, what goes out its emits", () => {
    expect(workflowBlock(script, "BARRY_UPPERCASE")).toBe(
      [
        "workflow BARRY_UPPERCASE {",
        "    take:",
        "    ch_files",
        "",
        "    main:",
        "    FILTER(ch_files)",
        "    MAP(FILTER.out)",
        "",
        "    emit:",
        "    map = MAP.out",
        "}",
      ].join("\n"),
    );
    expect(script).toMatch(/\n {4}BARRY_UPPERCASE\(ch_files\)\n {4}FILTER_2\(ch_files\)\n {4}MERGE\(BARRY_UPPERCASE\.out\.map\.concat/);
    expect(script).toMatch(/MAP -?\d+,-?\d+ "Map" @BARRY_UPPERCASE/);
  });

  it("imports back as the same grouped steps, and the same script", () => {
    const imported = importNextflowScript(script);
    expect(imported.nodes.filter((node) => node.data.group).map((node) => node.data.label)).toEqual(["Filter", "Map"]);
    expect(generate(imported.nodes, imported.edges)).toBe(script);
  });

  it("calls groups in order when one reads another's output, and names emits apart", () => {
    const fixture = buildLintFixtures().find((candidate) => candidate.name === "grouped-subworkflow-chain") as {
      nodes: Node<NodeData>[];
      edges: Edge[];
    };
    const chain = generate(fixture.nodes, fixture.edges);
    expect(chain.indexOf("    INDEX(ch_files)")).toBeLessThan(chain.indexOf("    TRIM_AND_ALIGN(ch_samplesheet, INDEX.out.index)"));
    // A subworkflow's processes run as GROUP:SUB:PROC in a group.
    expect(chain).toContain("withName: 'TRIM_AND_ALIGN:FASTQ_ALIGN_BWA:.*'");
    expect(chain).toContain("withName: 'BWA_INDEX'");
    const demo3 = buildLintFixtures().find((candidate) => candidate.name === "grouped-demo-3") as { nodes: Node<NodeData>[]; edges: Edge[] };
    const prepare = workflowBlock(generate(demo3.nodes, demo3.edges), "PREPARE_GENOME");
    expect(prepare).toContain("star_index_index = STAR_INDEX.out.index");
    expect(prepare).toContain("salmon_index_index = SALMON_INDEX.out.index");
  });

  it("can't be written when data leaves it and comes back", () => {
    const loop = withGroup(nodes, ["demo-filter-barry", "demo-merge"], "G");
    expect(() => generate(loop, edges)).toThrow(/comes back into it/);
    const problems = checkWorkflow(loop, edges, {
      missingNfCoreComponents: [],
      settings: DEFAULT_EXECUTION_SETTINGS,
      docker: null,
      nextflow: null,
      limits: null,
    });
    expect(problems).toContainEqual(expect.objectContaining({ id: "group-cycle:G", level: "error", nodeId: "demo-filter-barry" }));
  });

  it("names its steps' lines, tasks and conditions after the steps", () => {
    const { script: withNames, names } = generateNextflowScriptWithNames(grouped, edges, "Demo", "results");
    const owners = lineOwners(withNames, names, grouped);
    const lines = withNames.split("\n");
    const line = (text: string) => lines.indexOf(text) + 1;
    expect(owners.get(line("    MAP(FILTER.out)"))).toBe("demo-map-uppercase");
    expect(nodeIdForProcess("BARRY_UPPERCASE:MAP", grouped)).toBe("demo-map-uppercase");
    expect(Object.keys(summarizeNodeRuns([{ hash: "a/1", name: "BARRY_UPPERCASE:FILTER (1)", process: "BARRY_UPPERCASE:FILTER", status: "succeeded" }], grouped))).toEqual([
      "demo-filter-barry",
    ]);
    const result = {
      steps: [{ id: "BARRY_UPPERCASE.MAP", name: "MAP", subworkflow: "BARRY_UPPERCASE", conditions: ["params.upper"] }],
      subworkflows: [{ id: "BARRY_UPPERCASE", name: "BARRY_UPPERCASE", workflow: "BARRY_UPPERCASE", file: null, parent: null }],
    } as unknown as BioflowResult;
    expect(Object.fromEntries(conditionsByNode(result, names))).toEqual({ "demo-map-uppercase": ["params.upper"] });
  });
});

describe("importing groups", () => {
  it("reads a group from a project's subworkflows/local", () => {
    const script = [
      "include { G } from './subworkflows/local/g'",
      "",
      "workflow {",
      "    ch_x = channel.of(1)",
      "    G(ch_x)",
      "    G.out.y.view()",
      "}",
      "",
      '// N-WAVE layout: ch_x 0,0 "X"; P 10,0 "P" @G',
    ].join("\n");
    const files = {
      "subworkflows/local/g/main.nf": [
        "include { P } from '../../../modules/local/p'",
        "",
        "workflow G {",
        "    take:",
        "    ch_in",
        "",
        "    main:",
        "    P(ch_in)",
        "",
        "    emit:",
        "    y = P.out",
        "}",
      ].join("\n"),
    };
    const inlined = inlineGroups(script, { files, path: "main.nf" });
    expect(inlined.source).toContain("include { P } from './modules/local/p'");
    expect(inlined.source).toContain("    P(ch_x)\n");
    expect(inlined.source).toContain("    P.out.view()");
    expect(inlined.source).not.toContain("workflow G");
    expect([...inlined.groups]).toEqual([["P", "G"]]);
  });

  it("leaves other named workflows as they are", () => {
    const script = "workflow G {\n    main:\n    channel.of(1)\n}\n\nworkflow {\n    G()\n}\n";
    expect(inlineGroups(script).source).toBe(script);
  });

  it("puts a subworkflow's selectors in its group, and takes them out again", () => {
    const config = "withName: 'SUB:.*' { a = 1 }\nwithName: 'PROC' { b = 2 }";
    const grouped = withGroupSelectors(config, "G");
    expect(grouped).toBe("withName: 'G:SUB:.*' { a = 1 }\nwithName: 'PROC' { b = 2 }");
    expect(withoutGroupSelectors(grouped, ["G"])).toBe(config);
  });

  it("round-trips every grouped fixture through a project too", () => {
    for (const fixture of buildLintFixtures().filter((candidate) => candidate.name.startsWith("grouped-"))) {
      const first = generate(fixture.nodes, fixture.edges);
      const imported = importNextflowScript(first, { catalog: catalog as unknown as NfCoreCatalogForImport });
      registerDynamicNodeDefinitions(imported.definitions);
      expect(groupsOf(imported.nodes).size, fixture.name).toBe(groupsOf(fixture.nodes).size);
      expect(generate(imported.nodes, imported.edges), fixture.name).toBe(first);
    }
  });
});

describe("on the canvas", () => {
  const { nodes } = demo();
  const grouped = withGroup(nodes, BRANCH, "BRANCH");

  it("frames a group's steps in the editor", () => {
    const [frame] = groupFrames(grouped);
    expect(frame).toMatchObject({ id: "frame:BRANCH", type: "groupFrame", data: { group: "BRANCH", steps: ["Filter", "Map"] } });
    const left = Math.min(...grouped.filter((node) => BRANCH.includes(node.id)).map((node) => node.position.x));
    expect(frame.position.x).toBeLessThan(left);
  });

  it("suggests BioFlow-Insight's groups of two steps or more, not those already grouped", () => {
    const names = new Map([
      ["demo-filter-barry", "FILTER"],
      ["demo-map-uppercase", "MAP"],
      ["demo-filter-bee", "FILTER_2"],
      ["demo-merge", "MERGE"],
    ]);
    const result = {
      steps: ["FILTER", "MAP", "FILTER_2", "MERGE"].map((name) => ({ id: name, name, subworkflow: null, conditions: [] })),
      subworkflows: [],
      groups: {
        dominator: [{ steps: ["FILTER", "MAP"], parent: null }, { steps: ["MERGE"], parent: null }],
        parallel: [{ steps: ["FILTER", "MAP", "FILTER_2", "MERGE"], parent: null }],
        condition: null,
      },
    } as unknown as BioflowResult;
    expect(groupSuggestions(result, names, nodes)).toEqual([{ kind: "dominator", ids: BRANCH }]);
    expect(groupSuggestions(result, names, grouped)).toEqual([]);
  });
});

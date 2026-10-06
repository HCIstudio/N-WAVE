import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { generateNextflowScript } from "../generators";
import {
  CHANNEL_OPERATOR_TEMPLATES,
  generateChannelOperatorNode,
  validateChannelOperator,
} from "./channelOperator";
import { nodeDefinitions } from "./nodeDefinitions";

const operatorNode = (
  templateId: string,
  overrides: Record<string, unknown> = {},
): Node => {
  const template = CHANNEL_OPERATOR_TEMPLATES.find(
    (entry) => entry.id === templateId,
  );
  if (!template) throw new Error(`No template ${templateId}`);
  return {
    id: "op",
    type: "channelOperator",
    position: { x: 0, y: 0 },
    data: {
      inputs: template.inputs.map((name) => ({ name })),
      outputs: template.outputs.map((name) => ({ name })),
      channelOperatorCode: template.code,
      ...overrides,
    },
  };
};

/** Generate a node with each input connected to `<input>_up`. */
const generate = (
  node: Node,
  connected = node.data.inputs.map((port: { name: string }) => port.name),
) =>
  generateChannelOperatorNode({
    node,
    processName: "op",
    incomingEdges: connected.map((input: string) => ({
      id: input,
      source: "x",
      target: "op",
      targetHandle: input,
    })),
    upstreamChannelName: null,
    outputChannelName: null,
    channelNameMap: new Map(
      node.data.outputs.map((port: { name: string }) => [
        `op.${port.name}`,
        `op_${port.name}`,
      ]),
    ),
    outputDisplayCounter: 1,
    outputNamingPattern: "",
    workflowName: "wf",
    timestamp: 0,
    date: "",
    resolveChannelNameForEdge: (edge) => `${edge.targetHandle}_up`,
    buildMixedChannelExpression: (names) => names.join(", "),
    sanitizeVarName: (name) => name.replace(/[^A-Za-z0-9_]/g, "_"),
  });

describe("channel operator templates", () => {
  const expected: Record<
    string,
    { code: string; defines: string[]; uses: string[] }
  > = {
    join: {
      code: "    op_joined = left_up.join(right_up)\n",
      defines: ["op_joined"],
      uses: ["left_up", "right_up"],
    },
    mix: {
      code: "    op_mixed = a_up.mix(b_up)\n",
      defines: ["op_mixed"],
      uses: ["a_up", "b_up"],
    },
    map: {
      code: "    op_out = in_up.map { meta, files ->\n        [ meta.subMap('id', 'single_end'), files ]\n    }\n",
      defines: ["op_out"],
      uses: ["in_up"],
    },
    branch: {
      code: [
        "    op_branched = in_up.branch { meta, reads ->",
        "        single: meta.single_end",
        "        paired: true",
        "    }",
        "    op_single = op_branched.single",
        "    op_paired = op_branched.paired",
        "",
      ].join("\n"),
      defines: ["op_branched", "op_single", "op_paired"],
      uses: ["in_up"],
    },
    combine: {
      code: "    op_combined = left_up.combine(right_up)\n",
      defines: ["op_combined"],
      uses: ["left_up", "right_up"],
    },
    groupTuple: {
      code: [
        "    op_grouped = in_up",
        "        .map { meta, files -> [ meta.id, meta, files ] }",
        "        .groupTuple()",
        "        .map { id, metas, files -> [ metas[0], files.flatten() ] }",
        "",
      ].join("\n"),
      defines: ["op_grouped"],
      uses: ["in_up"],
    },
    collect: {
      code: "    op_all = in_up.collect()\n",
      defines: ["op_all"],
      uses: ["in_up"],
    },
  };

  it("covers every template", () => {
    expect(
      CHANNEL_OPERATOR_TEMPLATES.map((template) => template.id).sort(),
    ).toEqual(Object.keys(expected).sort());
  });

  for (const [templateId, { code, defines, uses }] of Object.entries(
    expected,
  )) {
    it(`wires the ${templateId} template`, () => {
      const template = CHANNEL_OPERATOR_TEMPLATES.find(
        (entry) => entry.id === templateId,
      );
      expect(
        validateChannelOperator({
          inputs: template?.inputs ?? [],
          outputs: template?.outputs ?? [],
          code: template?.code ?? "",
        }),
      ).toEqual([]);
      const result = generate(operatorNode(templateId));
      expect(result?.processInvocations).toEqual([code]);
      expect(result?.dependencies).toEqual({ defines, uses });
      expect(result?.includeInExecutionOrder).toBe(false);
    });
  }

  it("uses Channel.empty() for unconnected inputs and waits for any input", () => {
    expect(generate(operatorNode("mix"), ["a"])?.processInvocations).toEqual([
      "    op_mixed = a_up.mix(Channel.empty())\n",
    ]);
    expect(generate(operatorNode("mix"), [])).toBeNull();
  });
});

describe("validateChannelOperator", () => {
  it("reports unknown ports, unassigned outputs, bad names and unused inputs", () => {
    expect(
      validateChannelOperator({
        inputs: ["a", "b", "a", "2x"],
        outputs: ["out", "extra"],
        code: "output.out = input.a.mix(input.c)\noutput.typo = input.a",
      }).map((issue) => `${issue.level}: ${issue.message}`),
    ).toEqual([
      'error: "2x" isn\'t a valid port name.',
      "error: Port names must be unique: a.",
      "error: input.c isn't an input of this node.",
      "error: output.typo isn't an output of this node.",
      'error: output.extra is never assigned (write "output.extra = ...").',
      "warning: input.b isn't used in the code.",
      "warning: input.2x isn't used in the code.",
    ]);
    expect(
      validateChannelOperator({ inputs: ["a"], outputs: [], code: "" }),
    ).toContainEqual({
      level: "error",
      message: "Add at least one output.",
    });
  });

  it("doesn't generate code with errors", () => {
    expect(
      generate(
        operatorNode("join", {
          channelOperatorCode: "output.joined = input.nope",
        }),
      ),
    ).toBeNull();
  });
});

describe("channel operators in a workflow", () => {
  const node = (id: string, definitionId: string, data = {}): Node => {
    const definition = nodeDefinitions.find(
      (entry) => entry.id === definitionId,
    );
    if (!definition) throw new Error(`No node definition ${definitionId}`);
    return {
      id,
      type: definition.type,
      position: { x: 0, y: 0 },
      data: { ...definition.defaults, ...data },
    };
  };

  it("orders operator code after the processes it reads, with closure variables left alone", () => {
    const nodes = [
      // Operator first, so node order alone can't give the right order.
      node("grouped", "channelOperator", {
        inputs: [{ name: "in" }],
        outputs: [{ name: "out" }],
        channelOperatorCode:
          "output.out = input.in.map { sample_id -> [ sample_id, file_count ] }",
      }),
      node("reads", "fileInput", { files: [{ name: "a.txt", content: "a" }] }),
      node("upper", "map"),
      node("show", "outputDisplay"),
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "reads",
        sourceHandle: "out",
        target: "upper",
        targetHandle: "in",
      },
      {
        id: "e2",
        source: "upper",
        sourceHandle: "out",
        target: "grouped",
        targetHandle: "in",
      },
      {
        id: "e3",
        source: "grouped",
        sourceHandle: "out",
        target: "show",
        targetHandle: "in",
      },
    ];
    const script = generateNextflowScript(
      nodes,
      edges,
      "wf",
      "results",
      "{workflow_name}",
    );
    const workflow = script.slice(script.indexOf("workflow {"));
    const producer = workflow.search(/upper_out = /);
    const operator = workflow.indexOf(
      "grouped_out = upper_out.map { sample_id -> [ sample_id, file_count ] }",
    );
    const consumer = workflow.search(/outputDisplay_show\(grouped_out/);
    expect(producer).toBeGreaterThan(-1);
    expect(operator).toBeGreaterThan(producer);
    expect(consumer).toBeGreaterThan(operator);
  });
});

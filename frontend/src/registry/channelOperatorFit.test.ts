import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { fittedTemplateCode, itemFieldsInto, readFilter, writeFilter } from "./channelOperatorFit";
import { validateChannelOperator } from "./channelOperator";

const node = (id: string, type: string, data: Partial<NodeData> = {}): Node<NodeData> =>
  ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } }) as Node<NodeData>;
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

describe("itemFieldsInto", () => {
  const op = node("op", "channelOperator");
  it("reads a tuple output's parts", () => {
    const step = node("step", "process", { outputs: [{ name: "tifs", fields: ["id", "tif"] }] });
    expect(itemFieldsInto("op", "in", [step, op], [edge("step", "tifs", "op", "in")])).toEqual(["id", "tif"]);
  });
  it("knows samplesheet rows, nf-core tuples and single files", () => {
    expect(itemFieldsInto("op", "in", [node("s", "samplesheet"), op], [edge("s", "samples", "op", "in")])).toEqual(["meta", "reads"]);
    const module = node("m", "process", { outputs: [{ name: "bam", metaTuple: true }] });
    expect(itemFieldsInto("op", "in", [module, op], [edge("m", "bam", "op", "in")])).toEqual(["meta", "files"]);
    expect(itemFieldsInto("op", "in", [node("f", "fileInput"), op], [edge("f", "file", "op", "in")])).toEqual(["file"]);
  });
  it("gives nothing when unconnected or not known", () => {
    expect(itemFieldsInto("op", "in", [op], [])).toBeNull();
    const other = node("o", "channelOperator", { outputs: [{ name: "out" }] });
    expect(itemFieldsInto("op", "in", [other, op], [edge("o", "out", "op", "in")])).toBeNull();
  });
});

describe("fittedTemplateCode", () => {
  it("takes the items apart into their parts, marking unused ones", () => {
    expect(fittedTemplateCode("filter", ["id", "tif"])).toBe("output.kept = input.in.filter { id, _tif -> id == 'value' }");
    expect(fittedTemplateCode("map", ["id", "tif"])).toBe("output.out = input.in.map { id, tif ->\n    [ id, tif ]\n}");
    expect(fittedTemplateCode("flatMap", ["id", "tifs"])).toBe(
      "output.out = input.in.flatMap { id, tifs ->\n    tifs.collect { item -> [ id, item ] }\n}",
    );
    expect(fittedTemplateCode("filter", ["meta", "reads"])).toBe("output.kept = input.in.filter { meta, _reads -> !meta.single_end }");
    expect(fittedTemplateCode("filter", ["file"])).toBe("output.kept = input.in.filter { file -> file.size() > 0 }");
  });
  it("is valid channel code", () => {
    for (const template of ["filter", "map", "flatMap"])
      for (const fields of [["file"], ["id", "tif"], ["meta", "a", "b"]]) {
        const code = fittedTemplateCode(template, fields) as string;
        const outputs = [template === "filter" ? "kept" : "out"];
        expect(validateChannelOperator({ inputs: ["in"], outputs, code }).filter((issue) => issue.level === "error")).toEqual([]);
      }
  });
  it("leaves other templates alone", () => {
    expect(fittedTemplateCode("join", ["id", "tif"])).toBeNull();
  });
});

describe("filter form", () => {
  it("reads and writes a comparison of a part with a value", () => {
    const form = readFilter("output.kept = input.in.filter { id, _tif -> id == 'gv' }");
    expect(form).toEqual({ output: "kept", input: "in", fields: ["id", "tif"], field: "id", comparison: "is", value: "gv" });
    expect(writeFilter({ ...(form as NonNullable<typeof form>), field: "tif", comparison: "isNot", value: "x'y" })).toBe(
      "output.kept = input.in.filter { _id, tif -> tif != 'x\\'y' }",
    );
  });
  it("reads properties, flags and numbers", () => {
    expect(readFilter("output.kept = input.in.filter { meta, _files -> !meta.single_end }")).toMatchObject({
      field: "meta.single_end",
      comparison: "isFalse",
    });
    const form = readFilter("output.big = input.rows.filter { row -> row.depth >= 10 }");
    expect(form).toMatchObject({ output: "big", input: "rows", field: "row.depth", comparison: "ge", value: "10" });
    expect(writeFilter(form as NonNullable<typeof form>)).toBe("output.big = input.rows.filter { row -> row.depth >= 10 }");
  });
  it("leaves anything else as code", () => {
    expect(readFilter("output.kept = input.in.filter { id, _tif -> id == 'a' || id == 'b' }")).toBeNull();
    expect(readFilter("output.kept = input.in.filter { it.size() > 1 }")).toBeNull();
    expect(readFilter("output.kept = input.in.filter { x -> other == 1 }")).toBeNull();
  });
});

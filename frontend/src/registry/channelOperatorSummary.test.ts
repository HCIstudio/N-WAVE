import { describe, expect, it } from "vitest";
import { summarizeChannelCode } from "./channelOperatorSummary";

describe("summarizeChannelCode", () => {
  it("names a filter by its condition", () => {
    expect(summarizeChannelCode('output.kept = input.in.filter { id, value -> id == "gv" }')).toEqual({
      label: "filter",
      subtitle: 'id == "gv"',
    });
  });

  it("chains operators, leaving out closures inside them and naming calls", () => {
    const code = "input.in.map { it.collect { x -> x } }.flatMap { a, b -> b }.collect().set { output.out }";
    expect(summarizeChannelCode(code)).toEqual({ label: "map → flatMap → collect", subtitle: "it.collect { x -> x }" });
  });

  it("names channel factories and their arguments", () => {
    expect(summarizeChannelCode("output.ch_reads = channel.fromPath(params.input, checkIfExists: true)")).toEqual({
      label: "channel.fromPath",
      subtitle: "params.input, checkIfExists: true",
    });
  });

  it("prefers a closure given after the arguments", () => {
    expect(summarizeChannelCode("output.out = input.in.groupTuple(by: 0).map(x) { a -> a.size() }").label).toBe("groupTuple → map");
    expect(summarizeChannelCode("output.out = input.in.map(x) { a -> a.size() }").subtitle).toBe("a.size()");
  });

  it("shortens long chains and subtitles", () => {
    const summary = summarizeChannelCode(`output.o = input.i.a().b().c().d { ${"x".repeat(80)} }`);
    expect(summary?.label).toBe("a → b → c → …");
    expect(summarizeChannelCode(`output.o = input.i.filter { ${"x".repeat(80)} }`)?.subtitle.endsWith("…")).toBe(true);
  });

  it("gives nothing for code without operators", () => {
    expect(summarizeChannelCode("output.out = input.in")).toBeNull();
    expect(summarizeChannelCode('output.s = "a.b(c)"')).toBeNull();
  });
});

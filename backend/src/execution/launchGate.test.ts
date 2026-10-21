import { describe, expect, it } from "vitest";
import { isLaunchGateBusy, isLaunchLine, passLaunchGate } from "./launchGate";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the launch gate of a pipeline", () => {
  it("lets one run of a pipeline download it at a time", async () => {
    const order: string[] = [];
    const openFirst = await passLaunchGate("nf-core/demo");
    order.push("first starts");
    const second = passLaunchGate("nf-core/demo").then((open) => {
      order.push("second starts");
      return open;
    });
    // Another pipeline doesn't wait.
    const other = await passLaunchGate("nf-core/rnaseq");
    order.push("other starts");
    await tick();
    expect(order).toEqual(["first starts", "other starts"]);
    expect(isLaunchGateBusy("nf-core/demo")).toBe(true);

    openFirst();
    openFirst(); // opening twice is harmless
    const openSecond = await second;
    expect(order).toEqual(["first starts", "other starts", "second starts"]);
    openSecond();
    other();
    expect(isLaunchGateBusy("nf-core/demo")).toBe(false);
    expect(isLaunchGateBusy("nf-core/rnaseq")).toBe(false);
  });

  it("opens on Nextflow's launch line", () => {
    expect(isLaunchLine("N E X T F L O W  ~  version 25.10.4\nLaunching `https://github.com/nf-core/demo` [jolly_kay] DSL2 - revision: 04060b4644 [1.0.1]\n")).toBe(true);
    expect(isLaunchLine("Checking nf-core/demo ...\n")).toBe(false);
  });
});

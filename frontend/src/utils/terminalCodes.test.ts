import { describe, expect, it } from "vitest";
import { stripTerminalCodes } from "./terminalCodes";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("stripTerminalCodes", () => {
  it("removes colours and styles", () => {
    expect(stripTerminalCodes(`${ESC}[2m[${ESC}[0m${ESC}[34mab/123456${ESC}[0m]`)).toBe(
      "[ab/123456]",
    );
  });

  it("keeps a link's text, ended by BEL or ESC \\", () => {
    const link = (url: string, text: string, end: string) =>
      `${ESC}]8;;${url}${end}${text}${ESC}]8;;${end}`;
    expect(stripTerminalCodes(`[${link("file:///work/72/6ebddb07", "72/6ebddb", BEL)}]`)).toBe(
      "[72/6ebddb]",
    );
    expect(
      stripTerminalCodes(`[${link("file:///work/72/6ebddb07", "72/6ebddb", `${ESC}\\`)}]`),
    ).toBe("[72/6ebddb]");
  });

  it("leaves plain text alone", () => {
    expect(stripTerminalCodes("executor >  local (76)")).toBe("executor >  local (76)");
  });
});

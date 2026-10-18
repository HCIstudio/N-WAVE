import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DynamicIcon from "./DynamicIcon";

describe("DynamicIcon", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "renders the fallback icon for %s instead of crashing",
    (name) => {
      expect(renderToStaticMarkup(<DynamicIcon name={name} />)).toBe(
        renderToStaticMarkup(<DynamicIcon name="Code" />),
      );
    },
  );

  it("renders a registered icon", () => {
    expect(renderToStaticMarkup(<DynamicIcon name="Dna" />)).toContain(
      "lucide-dna",
    );
  });
});

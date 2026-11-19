import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BetaBadge, BetaNote, betaReportUrl } from "./BetaBadge";

describe("a beta feature", () => {
  it("is labelled Beta, says it is under test, and links to the test report form with its name", () => {
    render(<BetaNote feature="I/O monitor">some file accesses can be missed on Docker Desktop.</BetaNote>);
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Beta");
    expect(note.textContent).toContain("Under test: some file accesses can be missed on Docker Desktop.");
    const link = screen.getByRole("link", { name: "Report how it works on yours" });
    expect(link.getAttribute("href")).toBe(betaReportUrl("I/O monitor"));
    expect(betaReportUrl("I/O monitor")).toBe(
      "https://github.com/HCIstudio/N-WAVE/issues/new?template=beta_feedback.yml&title=%5BBeta%5D%20I%2FO%20monitor",
    );
  });

  it("takes a text colour for light panels, and keeps the panel's grey by default", () => {
    const { unmount } = render(<BetaNote feature="I/O monitor" />);
    expect(screen.getByRole("note").className).toContain("text-text-light");
    unmount();
    render(<BetaNote feature="I/O monitor" className="text-gray-700" />);
    expect(screen.getByRole("note").className).toContain("text-gray-700");
    expect(screen.getByRole("note").className).not.toContain("text-text-light");
  });

  it("explains the badge on hover", () => {
    render(<BetaBadge />);
    expect(screen.getByTitle(/still being tested on different machines/)).toBeTruthy();
  });
});

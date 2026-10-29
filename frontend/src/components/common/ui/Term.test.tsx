import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import Term from "./Term";
import { resetFeatures } from "../../../settings/useFeatures";

const setup = () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <p>
        Each row becomes a <Term id="tuple">tuple</Term>.
      </p>
      <button type="button">Elsewhere</button>
    </MemoryRouter>,
  );
  return { user, button: screen.getByRole("button", { name: "About “Tuple”" }) };
};

describe("Term", () => {
  it("explains the term on hover, with a link to the glossary", async () => {
    const { user, button } = setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.hover(button);
    const card = screen.getByRole("dialog", { name: "Tuple" });
    expect(card.textContent).toContain("Several values that travel together");
    expect(screen.getByRole("link", { name: "All terms in the glossary (Help)" }).getAttribute("href")).toBe(
      "/help#tuple",
    );
    expect(screen.getByRole("link", { name: "Guide: nf-core library" }).getAttribute("href")).toBe(
      "https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library#using-a-module",
    );
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(card.id);
  });

  it("opens from the keyboard and closes with Escape", async () => {
    const { user, button } = setup();
    await user.tab();
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("dialog", { name: "Tuple" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open when clicked until a click elsewhere", async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.unhover(button);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.getByRole("dialog", { name: "Tuple" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows only the word when the glossary is switched off", () => {
    resetFeatures({ glossary: false });
    try {
      render(
        <MemoryRouter>
          <p>
            Each row becomes a <Term id="tuple">tuple</Term>.
          </p>
        </MemoryRouter>,
      );
      expect(screen.getByText(/Each row becomes a tuple/)).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    } finally {
      resetFeatures();
    }
  });
});

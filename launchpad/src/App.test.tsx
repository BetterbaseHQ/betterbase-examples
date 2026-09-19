import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import App from "./App";
import { renderWithProviders } from "@betterbase/examples-shared/test";

describe("Launchpad", () => {
  it("renders links to the example apps", () => {
    renderWithProviders(<App />);
    // Anchor cards for the example apps
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.length).toBeGreaterThan(3);
    expect(hrefs.some((h) => /:538\d/.test(h))).toBe(true);
  });
});

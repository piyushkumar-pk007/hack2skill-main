import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { PaceIndicator } from "./PaceIndicator";

// Pace targets: relaxed=2, balanced=3, packed=4

describe("PaceIndicator – status label", () => {
  it("shows 'On target' when average matches the pace target exactly", () => {
    const { getByText } = render(<PaceIndicator pace="balanced" averageItemsPerDay={3} />);
    expect(getByText("On target")).toBeInTheDocument();
  });

  it("shows 'On target' when delta is within ±0.5 of target", () => {
    const { getByText } = render(<PaceIndicator pace="balanced" averageItemsPerDay={3.4} />);
    expect(getByText("On target")).toBeInTheDocument();
  });

  it("shows 'Ahead' when average exceeds target by more than 0.5", () => {
    const { getByText } = render(<PaceIndicator pace="relaxed" averageItemsPerDay={3} />);
    // delta = 3 - 2 = 1 > 0.5
    expect(getByText("Ahead")).toBeInTheDocument();
  });

  it("shows 'Underbooked' when average is more than 0.5 below target", () => {
    const { getByText } = render(<PaceIndicator pace="packed" averageItemsPerDay={2} />);
    // delta = 2 - 4 = -2 < -0.5
    expect(getByText("Underbooked")).toBeInTheDocument();
  });
});

describe("PaceIndicator – content rendering", () => {
  it("displays the pace label in the description", () => {
    const { getByText } = render(<PaceIndicator pace="relaxed" averageItemsPerDay={2} />);
    expect(getByText(/relaxed/i)).toBeInTheDocument();
  });

  it("displays average / target in stat value", () => {
    const { getByText } = render(<PaceIndicator pace="balanced" averageItemsPerDay={2.5} />);
    expect(getByText("2.5 / 3")).toBeInTheDocument();
  });
});

describe("PaceIndicator – accessibility", () => {
  it("has no axe violations for relaxed / on-target state", async () => {
    const { container } = render(<PaceIndicator pace="relaxed" averageItemsPerDay={2} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations for packed / ahead state", async () => {
    const { container } = render(<PaceIndicator pace="packed" averageItemsPerDay={5} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("uses a section with aria-labelledby for the region landmark", () => {
    const { getByRole } = render(<PaceIndicator pace="balanced" averageItemsPerDay={3} />);
    // The component renders a <section aria-labelledby="pace-indicator-heading">
    const region = getByRole("region", { name: /pace indicator/i });
    expect(region).toBeInTheDocument();
  });
});

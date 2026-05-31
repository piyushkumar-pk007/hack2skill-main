import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlanTripPage } from "./PlanTripPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiClient = {
  getPreferences: vi.fn().mockResolvedValue({
    preferences: {
      interests: ["culture", "food"],
      pace: "balanced",
      travelStyle: "comfort",
      dietary: ["vegetarian"],
      accessibilityNeeds: ["step-free"],
      preferredTransport: ["walk", "metro"],
    },
  }),
  updatePreferences: vi.fn().mockResolvedValue({}),
  createTrip: vi.fn().mockResolvedValue({ trip: { id: "trip-abc" } }),
};

vi.mock("../hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: "authenticated",
    user: { id: "u1", displayName: "Test User", email: "test@example.com" },
    accessToken: "mock-token",
    lastTripId: null,
    apiClient: mockApiClient,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn(),
    rememberTrip: vi.fn(),
  }),
}));

vi.mock("../components/ToastProvider", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToasts: () => ({ pushToast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderWizard() {
  const qc = new QueryClient({
    mutationCache: new MutationCache({ onError: () => {} }),
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, throwOnError: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PlanTripPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

describe("PlanTripPage wizard – step rendering", () => {
  it("renders all 4 step buttons (Who, When & Budget, Interests, Accessibility)", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /who/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /when/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /interests/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accessibility/i })).toBeInTheDocument();
  });

  it("shows 'Who' step fields on first render (Trip title visible)", () => {
    renderWizard();
    expect(screen.getByLabelText(/trip title/i)).toBeInTheDocument();
  });

  it("has the 'Next step' button on step 0", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /next step/i })).toBeInTheDocument();
  });

  it("has the 'Previous' button disabled on step 0", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("PlanTripPage wizard – step navigation", () => {
  it("advances to step 2 (When & Budget) after clicking Next on step 1", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Step 0 → 1: click 'Next step' (defaults are pre-filled so validation passes)
    await user.click(screen.getByRole("button", { name: /next step/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    });
  });

  it("enables 'Previous' after advancing past step 0", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /next step/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /previous/i })).not.toBeDisabled();
    });
  });

  it("jumps directly to a step when its stepper button is clicked", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /interests/i }));
    await waitFor(() => {
      expect(screen.getByText(/interests/i, { selector: "legend" })).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("PlanTripPage wizard – validation", () => {
  it("shows 'Trip title is required.' when title is cleared and Next is clicked", async () => {
    const user = userEvent.setup();
    renderWizard();

    const titleInput = screen.getByLabelText(/trip title/i);
    await user.clear(titleInput);
    await user.click(screen.getByRole("button", { name: /next step/i }));

    await waitFor(() => {
      expect(screen.getByText("Trip title is required.")).toBeInTheDocument();
    });
  });

  it("marks the title input as invalid when the error is shown", async () => {
    const user = userEvent.setup();
    renderWizard();

    const titleInput = screen.getByLabelText(/trip title/i);
    await user.clear(titleInput);
    await user.click(screen.getByRole("button", { name: /next step/i }));

    await waitFor(() => {
      expect(titleInput).toHaveAttribute("aria-invalid", "true");
    });
  });
});

// ---------------------------------------------------------------------------
// Accessibility (axe) on each wizard step
// ---------------------------------------------------------------------------

describe("PlanTripPage wizard – accessibility (axe)", () => {
  it("step 0 (Who) has no axe violations", async () => {
    const { container } = renderWizard();
    // Wait for the preferences query to settle
    await waitFor(() => {
      expect(screen.getByLabelText(/trip title/i)).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("step 1 (When & Budget) has no axe violations", async () => {
    const user = userEvent.setup();
    const { container } = renderWizard();
    await user.click(screen.getByRole("button", { name: /when/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("step 2 (Interests) has no axe violations", async () => {
    const user = userEvent.setup();
    const { container } = renderWizard();
    await user.click(screen.getByRole("button", { name: /interests/i }));
    await waitFor(() => {
      expect(screen.getByText(/interests/i, { selector: "legend" })).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("step 3 (Accessibility) has no axe violations", async () => {
    const user = userEvent.setup();
    const { container } = renderWizard();
    await user.click(screen.getByRole("button", { name: /accessibility/i }));
    await waitFor(() => {
      expect(screen.getByText(/accessibility needs/i, { selector: "legend" })).toBeInTheDocument();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Summary panel
// ---------------------------------------------------------------------------

describe("PlanTripPage wizard – summary panel", () => {
  it("shows the user's display name in the summary panel", async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByText(/test user/i)).toBeInTheDocument();
    });
  });

  it("reflects draft dates in the summary panel", () => {
    renderWizard();
    // Default draft has startDate: 2026-07-10
    expect(screen.getByText(/2026-07-10/)).toBeInTheDocument();
  });
});

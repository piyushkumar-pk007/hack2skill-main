import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: "anonymous",
    user: null,
    accessToken: null,
    lastTripId: null,
    apiClient: {},
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshAccessToken: vi.fn(),
    rememberTrip: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderAuthPage() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AuthPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthPage – initial render (login mode)", () => {
  it("shows the 'Welcome back' heading by default", () => {
    renderAuthPage();
    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("renders the email and password fields", () => {
    renderAuthPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows Login and Register tabs", () => {
    renderAuthPage();
    expect(screen.getByRole("tab", { name: /login/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /register/i })).toBeInTheDocument();
  });

  it("renders the 'Sign in' submit button", () => {
    renderAuthPage();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("AuthPage – register mode", () => {
  it("switches to 'Create your account' heading when Register tab is clicked", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("tab", { name: /register/i }));
    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
  });

  it("shows the Display name field in register mode", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("tab", { name: /register/i }));
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it("shows 'Create account' submit button in register mode", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("tab", { name: /register/i }));
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });
});

describe("AuthPage – client-side validation", () => {
  it("shows 'Email is required.' when submitted with empty email", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("Email is required.")).toBeInTheDocument();
    });
  });

  it("shows 'Password is required.' when submitted with empty password", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("Password is required.")).toBeInTheDocument();
    });
  });

  it("shows 'Display name is required.' in register mode when submitted blank", async () => {
    const user = userEvent.setup();
    renderAuthPage();
    await user.click(screen.getByRole("tab", { name: /register/i }));
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "password");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText("Display name is required.")).toBeInTheDocument();
    });
  });
});

describe("AuthPage – accessibility (axe)", () => {
  it("has no violations in login mode", async () => {
    const { container } = renderAuthPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no violations in register mode", async () => {
    const user = userEvent.setup();
    const { container } = renderAuthPage();
    await user.click(screen.getByRole("tab", { name: /register/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

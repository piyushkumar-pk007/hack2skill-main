// Type declarations for jest-axe (package bundles JS types that TypeScript
// may not resolve automatically under all moduleResolution settings).
declare module "jest-axe" {
  import type { AxeResults, RunOptions, Spec } from "axe-core";

  export interface JestAxeConfigureOptions {
    globalOptions?: Spec;
    cleanup?: boolean;
    impactLevels?: string[];
  }

  export function axe(element: Element | string, options?: RunOptions): Promise<AxeResults>;
  export function configureAxe(options?: JestAxeConfigureOptions): typeof axe;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const toHaveNoViolations: Record<string, (...args: any[]) => unknown>;
}

// Augment Vitest expect so `expect(results).toHaveNoViolations()` type-checks.
declare module "@vitest/expect" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

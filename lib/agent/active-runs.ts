// Shared across route modules and development hot reloads in this process.
const state = globalThis as typeof globalThis & {
  formaRuns?: Map<string, AbortController>;
};
export const activeRuns = state.formaRuns ??= new Map<string, AbortController>();

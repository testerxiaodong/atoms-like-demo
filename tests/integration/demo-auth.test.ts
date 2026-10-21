import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
import { authenticated } from "@/lib/projects/api";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubEnv("FORMA_DEMO", "1");
});
afterEach(() => vi.unstubAllEnvs());
it.each(["first-time-reviewer", "another-reviewer"])(
  "allows any valid signed-in demo user: %s",
  async (id) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id, email: id + "@example.com" } },
      error: null,
    });
    expect((await authenticated()).user.id).toBe(id);
  },
);
it("rejects missing or invalid authentication", async () => {
  for (const error of [null, new Error("invalid session")]) {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(authenticated()).rejects.toMatchObject({ status: 401 });
  }
});

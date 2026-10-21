import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.auth,
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      }),
    },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/env", () => ({ hasSupabase: () => true }));
import { GET } from "@/app/api/projects/[id]/versions/route";
const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const request = new Request(
  "http://localhost/api/projects/" + id + "/versions",
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
});
it("starts both RLS reads together and only selects project identity", async () => {
  let releaseAuth!: (result: unknown) => void;
  mocks.auth.mockReturnValue(
    new Promise((resolve) => {
      releaseAuth = resolve;
    }),
  );
  let release!: (result: unknown) => void;
  const ownerResult = new Promise((resolve) => {
    release = resolve;
  });
  const owner = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: () => ownerResult,
  };
  const versions = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: () => {
      release({ data: { id, owner_id: "owner" }, error: null });
      releaseAuth({ data: { user: { id: "owner" } }, error: null });
      return Promise.resolve({ data: [{ id: "version" }], error: null });
    },
  };
  mocks.from.mockImplementation((table) =>
    table === "projects" ? owner : versions,
  );
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect(mocks.auth).toHaveBeenCalledWith("test-token");
  expect(owner.select).toHaveBeenCalledWith("id,owner_id");
  expect(versions.eq).toHaveBeenCalledWith("project_id", id);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("server-timing")).toContain("database;dur=");
});
it.each([
  [{ code: "PGRST116", message: "No rows" }, 404],
  [{ code: "", message: "fetch failed" }, 503],
])(
  "does not return versions when owner lookup fails: %j",
  async (error, status) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      single: async () => ({ data: null, error }),
      limit: async () => ({ data: [{ id: "must-not-leak" }], error: null }),
    };
    mocks.from.mockReturnValue(chain);
    const response = await GET(request, context);
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("must-not-leak");
  },
);

it("rejects an invalid session even when both queries return data", async () => {
  mocks.auth.mockResolvedValue({
    data: { user: null },
    error: { message: "expired" },
  });
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => ({ data: { id, owner_id: "owner" }, error: null }),
    limit: async () => ({ data: [{ id: "must-not-leak" }], error: null }),
  };
  mocks.from.mockReturnValue(chain);
  const response = await GET(request, context);
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain("must-not-leak");
});

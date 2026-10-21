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
it('allows exact bundled examples anonymously in hosted mode but rejects modified or extra source', async()=>{
 mocks.getUser.mockResolvedValue({data:{user:null},error:null});
 const {POST}=await import('@/app/api/preview/route');
 const {examples}=await import('@/lib/templates/examples');
 const request=(files:Record<string,string>)=>new Request('https://demo.example/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files})});
 for(const example of examples){const response=await POST(request(example.files));expect(response.status).toBe(200);expect((await response.json()).html).toContain('id="root"');}
 const modified={...examples[0].files,'/App.tsx':'export default function App(){return <h1>custom</h1>}'};
 expect((await POST(request(modified))).status).toBe(401);
 expect((await POST(request({...examples[0].files,'/extra.ts':'export const x=1'}))).status).toBe(401);
});

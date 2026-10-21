import { afterEach, expect, it, vi } from "vitest";
import { demoUserAllowed, demoOrigin } from "@/lib/demo-access";
import { isLoopbackRequest } from "@/lib/agent/local-codex";
import { isLocalCodex } from "@/lib/env";
afterEach(() => vi.unstubAllEnvs());
it("demo fails closed without an allowlist and matches exact IDs", () => {
  vi.stubEnv("FORMA_DEMO", "1");
  vi.stubEnv("DEMO_ALLOWED_USER_IDS", "");
  expect(demoUserAllowed("owner")).toBe(false);
  vi.stubEnv("DEMO_ALLOWED_USER_IDS", " owner, second ");
  expect(demoUserAllowed("owner")).toBe(true);
  expect(demoUserAllowed("own")).toBe(false);
});
it("requires the exact configured HTTPS origin, including for loopback-forwarded requests", () => {
  vi.stubEnv("FORMA_DEMO", "1");
  vi.stubEnv("DEMO_ORIGIN", "https://demo.example");
  for (const origin of [
    "",
    "https://demo.example.evil.test",
    "http://demo.example",
    "http://localhost:3000",
  ])
    expect(
      isLoopbackRequest(
        new Request("http://localhost:3000/api", {
          headers: origin ? { origin } : {},
        }),
      ),
    ).toBe(false);
  expect(
    isLoopbackRequest(
      new Request("http://localhost:3000/api", {
        headers: { origin: "https://demo.example" },
      }),
    ),
  ).toBe(true);
  vi.stubEnv("DEMO_ORIGIN", "http://demo.example");
  expect(demoOrigin()).toBeNull();
});
it("production subscription mode needs explicit demo config and remains disabled on Vercel", () => {
  vi.stubEnv("AGENT_BACKEND", "codex-local");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("FORMA_DEMO", "");
  expect(isLocalCodex()).toBe(false);
  vi.stubEnv("FORMA_DEMO", "1");
  vi.stubEnv("DEMO_ORIGIN", "https://demo.example");
  vi.stubEnv("DEMO_ALLOWED_USER_IDS", "owner");
  expect(isLocalCodex()).toBe(true);
  vi.stubEnv("VERCEL", "1");
  expect(isLocalCodex()).toBe(false);
});

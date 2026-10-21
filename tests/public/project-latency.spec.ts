import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

test("project creation latency across the fixed domain", async ({
  context,
  baseURL,
}) => {
  const url = new URL(baseURL!);
  const auth = createServerClient(
    process.env.CLOUD_TEST_URL!,
    process.env.CLOUD_TEST_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: async (values) => {
          await context.addCookies(
            values.map(({ name, value }) => ({
              name,
              value,
              domain: url.hostname,
              path: "/",
              secure: true,
              sameSite: "Lax",
            })),
          );
        },
      },
    },
  );
  const { data: session, error } = await auth.auth.signInWithPassword({
    email: process.env.CLOUD_TEST_EMAIL!,
    password: process.env.CLOUD_TEST_PASSWORD!,
  });
  if (error) throw error;
  for (let sample = 1; sample <= 3; sample++) {
    const started = performance.now();
    const response = await context.request.post("/api/projects", {
      data: { name: `Latency sample ${sample}` },
    });
    const body = await response.json();
    const elapsedMs = Math.round(performance.now() - started);
    expect(response.status()).toBe(201);
    expect(body.project.owner_id).toBe(session.user!.id);
    const timing = response.headers()["server-timing"];
    expect(timing).toMatch(
      /auth;dur=[\d.]+, database;dur=[\d.]+, app;dur=[\d.]+/,
    );
    console.log(JSON.stringify({ sample, elapsedMs, serverTiming: timing }));
  }
});

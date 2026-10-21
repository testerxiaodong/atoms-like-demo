import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

test("version list latency across the fixed domain", async ({
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
  const created = await context.request.post("/api/projects", {
    data: { name: "Versions latency" },
  });
  expect(created.status()).toBe(201);
  const { project } = await created.json();
  expect(project.owner_id).toBe(session.user!.id);
  const saved = await context.request.post(`/api/projects/${project.id}/save`, {
    data: {
      revision: 0,
      files: {
        "/App.tsx":
          "export default function App(){return <div>Version test</div>}",
      },
    },
  });
  expect(saved.status()).toBe(200);
  for (let sample = 1; sample <= 3; sample++) {
    const started = performance.now();
    const response = await context.request.get(
      `/api/projects/${project.id}/versions`,
    );
    const body = await response.json();
    const elapsedMs = Math.round(performance.now() - started);
    expect(response.status()).toBe(200);
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0]).not.toHaveProperty("files");
    console.log(
      JSON.stringify({
        sample,
        elapsedMs,
        serverTiming: response.headers()["server-timing"],
      }),
    );
  }
});

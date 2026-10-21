import { test as base } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
export const test = base.extend({
  context: async ({ context }, runTest) => {
    const auth = createServerClient(
      process.env.CLOUD_TEST_URL || "http://localhost:54329",
      process.env.CLOUD_TEST_KEY || "local-test-key",
      {
        cookies: {
          getAll: () => [],
          setAll: async (values) => {
            await context.addCookies(
              values.map(({ name, value, options }) => ({
                name,
                value,
                domain: "localhost",
                path: "/",
                httpOnly: options.httpOnly ?? false,
                secure: false,
                sameSite: "Lax" as const,
              })),
            );
          },
        },
      },
    );
    const { error } = await auth.auth.signInWithPassword({
      email: process.env.CLOUD_TEST_EMAIL || "e2e@example.test",
      password: process.env.CLOUD_TEST_PASSWORD || "local-e2e-only",
    });
    if (error) throw error;
    await runTest(context);
  },
});

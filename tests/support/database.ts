import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
export async function database(other = false) {
  const client = createClient(
    process.env.CLOUD_TEST_URL!,
    process.env.CLOUD_TEST_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: (other
      ? process.env.CLOUD_TEST_OTHER_EMAIL
      : process.env.CLOUD_TEST_EMAIL)!,
    password: process.env.CLOUD_TEST_PASSWORD!,
  });
  expect(error).toBeNull();
  return client;
}

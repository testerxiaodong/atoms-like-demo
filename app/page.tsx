import { Home } from "@/components/home";
import { hasSupabase } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string; example?: string }>;
}) {
  const params = await searchParams;
  const user = hasSupabase()
    ? (await (await createClient()).auth.getUser()).data.user
    : null;
  return (
    <Home
      configured={hasSupabase()}
      signedIn={!!user}
      resume={params.resume === "1"}
      exampleId={params.example}
    />
  );
}

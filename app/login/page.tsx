import { AuthPage } from "@/components/auth-page";
import { hasSupabase } from "@/lib/env";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthPage
      configured={hasSupabase()}
      error={params.error === "auth"}
      build={params.next === "build"}
    />
  );
}

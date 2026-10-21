import { AuthPage } from "@/components/auth-page";
import { hasSupabase } from "@/lib/env";
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <AuthPage
      signup
      configured={hasSupabase()}
      build={(await searchParams).next === "build"}
    />
  );
}

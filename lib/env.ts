import { demoEnabled, demoOrigin } from "@/lib/demo-access";
export function hasSupabase() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function hasModel() {
  return (
    isLocalCodex() ||
    isRemoteCodex() ||
    Boolean(
      process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL,
    )
  );
}

export function isLocalCodex() {
  return (
    process.env.AGENT_BACKEND === "codex-local" &&
    (process.env.NODE_ENV !== "production" ||
      (demoEnabled() && !!demoOrigin())) &&
    !process.env.VERCEL
  );
}

export function isRemoteCodex() {
  return (
    process.env.AGENT_BACKEND === "codex-worker" &&
    Boolean(process.env.CODEX_WORKER_SECRET)
  );
}

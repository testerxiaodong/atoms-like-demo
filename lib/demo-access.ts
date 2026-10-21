// Explicit, server-only configuration for a temporary owner-operated demo.
export function demoEnabled() {
  return process.env.FORMA_DEMO === "1";
}
export function demoUserAllowed(id: string) {
  if (!demoEnabled()) return true;
  return (process.env.DEMO_ALLOWED_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(id);
}
export function demoOrigin() {
  if (!demoEnabled()) return null;
  try {
    const url = new URL(process.env.DEMO_ORIGIN || "");
    return url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

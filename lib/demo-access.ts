// Explicit, server-only configuration for a temporary authenticated demo.
export function demoEnabled() {
  return process.env.FORMA_DEMO === "1";
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FORMA_E2E === "1" ? ".next-e2e" : ".next",
  poweredByHeader: false,
  serverExternalPackages: ["esbuild"],
  // Generated applications resolve these packages dynamically during preview builds.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/react/**/*",
      "./node_modules/react-dom/**/*",
      "./node_modules/scheduler/**/*",
      "./node_modules/lucide-react/**/*",
      "./node_modules/@esbuild/**/*",
    ],
  },
};

export default nextConfig;

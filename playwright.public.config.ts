import { defineConfig, devices } from "@playwright/test";
if (!process.env.PUBLIC_TEST_ORIGIN || !process.env.CLOUD_TEST_EMAIL)
  throw new Error(
    "Use npm run test:public:long to provision and clean isolated users.",
  );
export default defineConfig({
  testDir: "./tests",
  outputDir: "cloud-test-results/public-results",
  testMatch: ["public/**/*.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 400_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "cloud-test-results/public-report", open: "never" },
    ],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PUBLIC_TEST_ORIGIN,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "only-on-failure",
  },
});

import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Only the cloud runner provisions accounts and guarantees cleanup.
if (!process.env.CLOUD_TEST_URL || !process.env.CLOUD_TEST_EMAIL || !process.env.CLOUD_TEST_PASSWORD) {
  throw new Error('Use npm run test:http:cloud to provision and clean up dedicated test accounts.');
}
export default defineConfig({
  ...base,
  testMatch: ['http/**/*.spec.ts'],
});

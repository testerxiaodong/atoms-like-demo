import { loadEnvFile } from "node:process";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
loadEnvFile(".env.worker");
await build({
  entryPoints: ["scripts/worker/worker.ts"],
  outfile: ".demo/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
});
await import(pathToFileURL(`${process.cwd()}/.demo/worker.mjs`).href);

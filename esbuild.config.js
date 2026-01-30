import * as esbuild from "esbuild";
import { cpSync } from "fs";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.js",
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Don't bundle npm packages - they'll be resolved from node_modules at runtime
  packages: "external",
});

// Copy templates directory to dist
cpSync("templates", "dist/templates", { recursive: true });

import * as esbuild from "esbuild";

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

console.log("Build complete!");

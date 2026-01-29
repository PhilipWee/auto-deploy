import * as p from "@clack/prompts";

async function main() {
  p.intro("auto-deploy");

  p.log.info("Hello world!");

  p.outro("Done!");
}

main().catch(console.error);

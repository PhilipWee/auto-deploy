import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as p from "@clack/prompts";

export interface WebhookServerOptions {
  port: number;
  secret: string;
  branch: string;
  onPush: () => void;
}

/**
 * Verify GitHub webhook signature
 */
function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const sig = Buffer.from(signature);
  const hmac = createHmac("sha256", secret);
  const digest = Buffer.from(`sha256=${hmac.update(payload).digest("hex")}`);

  if (sig.length !== digest.length) return false;

  return timingSafeEqual(sig, digest);
}

/**
 * Start a webhook server to listen for GitHub push events
 */
export function startWebhookServer(
  options: WebhookServerOptions
): ReturnType<typeof createServer> {
  const { port, secret, branch, onPush } = options;

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // Only accept POST requests to /webhook
      if (req.method !== "POST" || req.url !== "/webhook") {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      // Collect body
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      // Verify signature
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      if (!verifySignature(body, signature, secret)) {
        p.log.warn("Webhook signature verification failed");
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }

      // Check event type
      const event = req.headers["x-github-event"];
      if (event !== "push") {
        res.writeHead(200);
        res.end("OK - Ignored event");
        return;
      }

      // Parse payload
      let payload: { ref?: string };
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("Bad Request");
        return;
      }

      // Check if push is to our branch
      const expectedRef = `refs/heads/${branch}`;
      if (payload.ref !== expectedRef) {
        p.log.info(
          `Push to ${payload.ref}, ignoring (watching ${expectedRef})`
        );
        res.writeHead(200);
        res.end("OK - Different branch");
        return;
      }

      p.log.info(`Push detected to ${branch}, triggering update...`);
      res.writeHead(200);
      res.end("OK - Processing");

      // Trigger the update
      onPush();
    }
  );

  server.listen(port, () => {
    p.log.success(`Webhook server listening on port ${port}`);
    p.log.info(`Configure your GitHub webhook to POST to http://<your-ip>:${port}/webhook`);
  });

  return server;
}

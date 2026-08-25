import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./db/mongoose";
import { attachSignaling } from "./realtime/signaling";
import { startPriceCron } from "./services/priceCron";

async function main() {
  await connectDb();
  const app = createApp();

  // The weekly material-price refresh. Convenience only on Render's free tier,
  // where the instance sleeps and timers die with it — see services/priceCron
  // for the two triggers that actually guarantee freshness.
  startPriceCron();

  // Wrap Express in a raw HTTP server so Socket.IO (voice-call signaling) can
  // share the same port and CORS as the REST API.
  const server = createServer(app);
  attachSignaling(server);

  server.listen(env.PORT, () => {
    console.log(`[api] Buildora API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("[api] Failed to start:", err);
  process.exit(1);
});

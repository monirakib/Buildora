import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./db/mongoose";

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`[api] Buildora API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("[api] Failed to start:", err);
  process.exit(1);
});

import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "../config/env";

export async function connectDb(): Promise<boolean> {
  if (!env.MONGODB_URI) {
    console.warn("[db] MONGODB_URI not set, starting without a database connection.");
    console.warn("[db] Set it in apps/api/.env (local MongoDB or Atlas) to enable persistence.");
    return false;
  }
  // Some networks' default DNS can't resolve the mongodb+srv SRV records, which
  // makes Atlas connections fail with `querySrv ECONNREFUSED`. Pointing Node at
  // a public resolver (e.g. 8.8.8.8) fixes it. See DNS_SERVERS in apps/api/.env.
  if (env.DNS_SERVERS) {
    dns.setServers(env.DNS_SERVERS.split(",").map((s) => s.trim()));
  }
  await mongoose.connect(env.MONGODB_URI);
  console.log("[db] Connected to MongoDB");
  return true;
}

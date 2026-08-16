import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "../config/env";

/**
 * @param overrides.autoIndex Forces index auto-building on or off, ignoring the
 *   NODE_ENV rule below. `report:indexes` passes `false` because it must not
 *   change what it is measuring: importing the model barrel registers all 41
 *   schemas, so connecting with `autoIndex: true` would build every missing
 *   index as a side effect and the "before" report would show a database that
 *   the report itself had just fixed.
 */
export async function connectDb(overrides: { autoIndex?: boolean } = {}): Promise<boolean> {
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
  await mongoose.connect(env.MONGODB_URI, {
    /**
     * The driver defaults to 100 connections. A free-tier Atlas cluster allows
     * 500 across everything that talks to it, so one API process was entitled
     * to a fifth of the cluster — and a maintenance script running alongside it
     * could push the total over. Ten is ample for this workload and leaves room
     * for the migration and rotation scripts to run while the app is up.
     */
    maxPoolSize: 10,
    /**
     * Index builds are a deliberate step outside development — `pnpm
     * ensure:indexes`. Automatic building races the data migrations: the unique
     * index on profile.nidKeyBlind cannot exist until encrypt:pii has written
     * those values, so an auto-building deploy fails on a database that is
     * simply mid-migration.
     */
    autoIndex: overrides.autoIndex ?? env.NODE_ENV === "development",
  });
  console.log("[db] Connected to MongoDB");
  return true;
}

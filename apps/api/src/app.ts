import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { allowedOrigins } from "./config/origins";
import { REFRESH_HEADER } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  // The allowlist is a function rather than a string so more than one origin
  // can be permitted. `credentials: true` is what actually lets the browser
  // send and store the refresh cookie — and it is why the origin must be an
  // exact match and never "*": browsers refuse a wildcard on credentialed
  // requests, and rightly so.
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header at all: curl, server-to-server, same-origin
        // navigation. There is no browser-held cookie to abuse in that case.
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.includes(origin.replace(/\/$/, "")));
      },
      credentials: true,
      // Named explicitly so the preflight for a refresh call succeeds — and so
      // that it only succeeds for the origins above, which is what makes this
      // header usable as a CSRF guard.
      allowedHeaders: ["Content-Type", "Authorization", REFRESH_HEADER],
    })
  );
  // A fully drawn floor plan is by far the largest body this API accepts: at the
  // validator's own caps (400 walls, 400 openings, 300 pieces of furniture, 120
  // rooms) the JSON runs past 150 KB, which the 100 KB default would reject.
  app.use(express.json({ limit: "1mb" }));
  // Reads the refresh cookie on /api/auth/refresh and /api/auth/logout. Nothing
  // else in the app authenticates from a cookie.
  app.use(cookieParser());
  // SSLCommerz returns the payer to us with an ordinary HTML form POST, not
  // JSON — without this parser those callbacks arrive with an empty body and
  // every payment looks like it failed.
  app.use(express.urlencoded({ extended: false }));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

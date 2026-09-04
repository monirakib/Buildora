import { Router } from "express";
import { reverseGeocode, searchPlaces } from "../controllers/geo.controller";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const geoRouter = Router();

// Signed-in users only — this proxies a shared public geocoder, so it shouldn't
// be an open relay for anyone on the internet.
geoRouter.use(requireAuth);

/**
 * The geocoder behind this is Nominatim, run on donated hardware, and its usage
 * policy asks for at most one request a second per application. We are one
 * application in their eyes, so every Buildora user shares that budget.
 *
 * Hence two ceilings. The per-user one stops a search box firing on every
 * keystroke; the shared one keeps the whole platform inside the policy, because
 * staying welcome on a free public service is the actual constraint here — not
 * our own capacity.
 */
geoRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 30,
    keyBy: (req) => req.auth?.sub ?? req.ip ?? "unknown",
    message: "Too many map lookups, wait a moment",
  })
);
geoRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    keyBy: () => "platform",
    message: "Map search is busy right now, try again in a minute",
  })
);

geoRouter.get("/search", searchPlaces);
geoRouter.get("/reverse", reverseGeocode);

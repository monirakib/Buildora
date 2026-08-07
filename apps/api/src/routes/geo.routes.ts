import { Router } from "express";
import { reverseGeocode, searchPlaces } from "../controllers/geo.controller";
import { requireAuth } from "../middleware/auth";

export const geoRouter = Router();

// Signed-in users only — this proxies a shared public geocoder, so it shouldn't
// be an open relay for anyone on the internet.
geoRouter.use(requireAuth);

geoRouter.get("/search", searchPlaces);
geoRouter.get("/reverse", reverseGeocode);

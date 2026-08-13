import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { DeliveryEstimate, ProfessionalProfile } from "@buildora/shared";
import { Product } from "../models/Product";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { isRoutingConfigured, routeBetween } from "../services/routing";

/**
 * How far a supplier's stock has to travel to reach a build site, and how long
 * that takes by road.
 *
 * Both ends have to be real coordinates. The site's pin already exists on the
 * project; the supplier's comes from the warehouse pin on their verification
 * wizard. Where either is missing this answers with a reason rather than a
 * guess — geocoding a Bangladeshi street address would give a buyer a
 * confidently wrong ETA, which is worse than none.
 */

/** GET /api/marketplace/products/:id/delivery?projectId= — distance and ETA. */
export async function estimateDelivery(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: { message: "Product not found" } });

  const projectId = String(req.query.projectId ?? "");
  if (!isValidObjectId(projectId)) {
    return res.status(400).json({ error: { message: "Choose which project it's for" } });
  }

  const project = await Project.findById(projectId);
  if (!project || String(project.owner) !== req.auth!.sub) {
    return res.status(404).json({ error: { message: "Project not found" } });
  }

  const answer = (body: DeliveryEstimate) => res.json({ data: { delivery: body } });

  if (!isRoutingConfigured()) {
    return answer({ unavailableReason: "Delivery estimates aren't configured on this server" });
  }

  const seller = await User.findById(product.seller).select("profile");
  const warehouse = (seller?.profile as ProfessionalProfile | undefined)?.warehouseLocation;
  if (!warehouse?.lat || !warehouse?.lng) {
    return answer({
      unavailableReason: "This supplier hasn't pinned their warehouse on the map yet",
    });
  }
  if (!project.location?.lat || !project.location?.lng) {
    return answer({
      unavailableReason: "Add a map pin to your project's plot to see delivery distance",
    });
  }

  const from = { lat: warehouse.lat, lng: warehouse.lng };
  const to = { lat: project.location.lat, lng: project.location.lng };
  const route = await routeBetween(from, to);

  return answer(
    route
      ? { route, from, to }
      : { from, to, unavailableReason: "Couldn't work out a road route just now" }
  );
}

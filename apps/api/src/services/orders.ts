import { isValidObjectId } from "mongoose";
import { NotificationType, OrderStatus, type ProfessionalProfile } from "@buildora/shared";
import { MarketOrder } from "../models/MarketOrder";
import type { ProductDoc } from "../models/Product";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { notify } from "./notifications";
import { routeBetween } from "./routing";
import type { HydratedDocument } from "mongoose";

/**
 * Road distance from the seller's warehouse to the buyer's plot, if both ends
 * have coordinates and routing is configured. Returns null on anything missing:
 * an order without a distance is normal, not an error.
 */
async function routeForOrder(projectId: string, buyerId: string, sellerId: unknown) {
  if (!isValidObjectId(projectId)) return null;
  const project = await Project.findById(projectId).select("owner location");
  // Guard the ownership here too: a projectId is user input, and without this
  // somebody could probe whether a stranger's plot has a pin.
  if (!project || String(project.owner) !== buyerId) return null;
  if (!project.location?.lat || !project.location?.lng) return null;

  const seller = await User.findById(sellerId).select("profile.warehouseLocation");
  const warehouse = (seller?.profile as ProfessionalProfile | undefined)?.warehouseLocation;
  if (!warehouse?.lat || !warehouse?.lng) return null;

  return (
    (await routeBetween(
      { lat: warehouse.lat, lng: warehouse.lng },
      { lat: project.location.lat, lng: project.location.lng }
    )) ?? null
  );
}

export interface PlaceOrderInput {
  buyerId: string;
  product: HydratedDocument<ProductDoc>;
  quantity: number;
  deliveryAddress: string;
  phone: string;
  note?: string;
  projectId?: string;
}

/**
 * Places one order for one product and tells the seller.
 *
 * Shared by the single "Order" endpoint and by cart checkout, which calls it
 * once per line. Each line becomes its own order on purpose: an order belongs
 * to one seller, who confirms, dispatches and delivers it independently of
 * whatever else the buyer put in the cart.
 */
export async function placeOrderFor(input: PlaceOrderInput) {
  const { buyerId, product, quantity, deliveryAddress, phone, note, projectId } = input;

  // Snapshot the road distance at order time, so the buyer keeps seeing it on
  // the order afterwards. Deliberately stored rather than re-routed on every
  // read: it burns one ORS call instead of one per page view, and the distance
  // to a plot doesn't change.
  const route = projectId ? await routeForOrder(projectId, buyerId, product.seller) : null;

  const doc = await MarketOrder.create({
    buyer: buyerId,
    seller: product.seller,
    product: product._id,
    productSnapshot: {
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      priceBdt: product.priceBdt,
    },
    quantity,
    totalBdt: product.priceBdt * quantity,
    deliveryAddress,
    phone,
    note,
    project: route ? projectId : undefined,
    deliveryDistanceKm: route?.distanceKm,
    deliveryDurationMin: route?.durationMin,
    // The timeline starts the moment the order does, so "placed at" is a
    // recorded event rather than something inferred from createdAt.
    timeline: [{ status: OrderStatus.PLACED, at: new Date() }],
  });
  await doc.populate([
    { path: "buyer", select: "name phone" },
    { path: "seller", select: "name profile.company" },
  ]);

  // The seller has an order to fulfil.
  const buyer = doc.buyer as unknown as { name: string };
  notify(String(product.seller), {
    type: NotificationType.ORDER,
    title: `New order, ${quantity} × ${product.name}`,
    body: `${buyer.name} ordered ${quantity} ${product.unit}${quantity > 1 ? "s" : ""} for ৳ ${(
      product.priceBdt * quantity
    ).toLocaleString("en-US")}. Confirm it to start fulfilment.`,
    link: "/marketplace/orders",
    actorId: buyerId,
  });

  return doc;
}

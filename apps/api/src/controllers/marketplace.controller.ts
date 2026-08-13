import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  NotificationType,
  OrderStatus,
  ProductCategory,
  UserRole,
  type MarketOrder as MarketOrderShape,
  type Paginated,
  type Product as ProductShape,
  type ProfessionalProfile,
} from "@buildora/shared";
import { MarketOrder } from "../models/MarketOrder";
import { Project } from "../models/Project";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { notify } from "../services/notifications";
import { routeBetween } from "../services/routing";

/* ---------- Shapes sent to the client ---------- */

// Populated seller/buyer docs carry only what the projection selects.
type UserRef = {
  _id: unknown;
  name: string;
  role?: UserRole;
  verificationStatus?: string;
  phone?: string;
  profile?: { company?: string };
};

// Exported for reuse by the admin console's marketplace moderation views.
export function toProduct(doc: InstanceType<typeof Product>): ProductShape {
  const seller = doc.seller as unknown as UserRef;
  return {
    id: String(doc._id),
    seller: {
      id: String(seller._id),
      name: seller.name,
      company: seller.profile?.company,
      role: seller.role!,
      verificationStatus: seller.verificationStatus as ProductShape["seller"]["verificationStatus"],
    },
    name: doc.name,
    brand: doc.brand,
    category: doc.category,
    description: doc.description,
    unit: doc.unit,
    priceBdt: doc.priceBdt,
    imageUrl: doc.imageUrl,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toOrder(doc: InstanceType<typeof MarketOrder>): MarketOrderShape {
  const buyer = doc.buyer as unknown as UserRef;
  const seller = doc.seller as unknown as UserRef;
  return {
    id: String(doc._id),
    buyer: { id: String(buyer._id), name: buyer.name, phone: buyer.phone },
    seller: {
      id: String(seller._id),
      name: seller.name,
      company: seller.profile?.company,
    },
    product: {
      id: String(doc.product),
      name: doc.productSnapshot.name,
      brand: doc.productSnapshot.brand,
      unit: doc.productSnapshot.unit,
      priceBdt: doc.productSnapshot.priceBdt,
    },
    quantity: doc.quantity,
    totalBdt: doc.totalBdt,
    deliveryAddress: doc.deliveryAddress,
    phone: doc.phone,
    note: doc.note,
    status: doc.status,
    // Listed field by field rather than spread: these are Mongoose
    // subdocuments, and spreading one copies its internals instead of its data.
    timeline: doc.timeline.map((e) => ({
      status: e.status,
      at: e.at.toISOString(),
      note: e.note,
    })),
    expectedDeliveryAt: doc.expectedDeliveryAt?.toISOString(),
    projectId: doc.project ? String(doc.project) : undefined,
    deliveryDistanceKm: doc.deliveryDistanceKm,
    deliveryDurationMin: doc.deliveryDurationMin,
    paidAt: doc.paidAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export const sellerSelect = "name role verificationStatus profile.company";

/* ---------- Public browsing ---------- */

/**
 * GET /api/marketplace/products — public catalogue. Active listings only,
 * newest first, with optional text search and category filter.
 */
export async function listProducts(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));

  const filter: Record<string, unknown> = { isActive: true };

  const category = String(req.query.category ?? "");
  if (Object.values(ProductCategory).includes(category as ProductCategory)) {
    filter.category = category;
  }

  const search = String(req.query.search ?? "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    filter.$or = [{ name: rx }, { brand: rx }, { description: rx }];
  }

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("seller", sellerSelect),
    Product.countDocuments(filter),
  ]);

  const body: Paginated<ProductShape> = {
    items: docs.map(toProduct),
    total,
    page,
    pageSize,
  };
  return res.json({ data: body });
}

/* ---------- Seller listing management ---------- */

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const productSchema = z.object({
  name: z.string().trim().min(2, "Name the product").max(120),
  brand: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  category: z.enum(ProductCategory),
  description: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  unit: z.string().trim().min(1, "Set a selling unit, e.g. bag / ton / piece").max(30),
  priceBdt: z.coerce.number().min(1, "Set a price").max(100_000_000),
  imageUrl: z.preprocess(emptyToUndef, z.url("Enter a valid image URL").optional()),
  isActive: z.boolean().default(true),
});

/** GET /api/marketplace/products/mine — the seller's own listings. */
export async function listMyProducts(req: Request, res: Response) {
  const docs = await Product.find({ seller: req.auth!.sub })
    .sort({ createdAt: -1 })
    .populate("seller", sellerSelect);
  return res.json({ data: { products: docs.map(toProduct) } });
}

/** POST /api/marketplace/products — create a listing. */
export async function createProduct(req: Request, res: Response) {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const doc = await Product.create({ ...parsed.data, seller: req.auth!.sub });
  await doc.populate("seller", sellerSelect);
  return res.status(201).json({ data: { product: toProduct(doc) } });
}

/** PATCH /api/marketplace/products/:id — edit one of your own listings. */
export async function updateProduct(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  // Scoping the query by seller means you can only ever touch your own.
  const doc = await Product.findOneAndUpdate({ _id: id, seller: req.auth!.sub }, parsed.data, {
    new: true,
  }).populate("seller", sellerSelect);
  if (!doc) return res.status(404).json({ error: { message: "Product not found" } });
  return res.json({ data: { product: toProduct(doc) } });
}

/** DELETE /api/marketplace/products/:id — remove one of your own listings. */
export async function deleteProduct(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  const doc = await Product.findOneAndDelete({ _id: id, seller: req.auth!.sub });
  if (!doc) return res.status(404).json({ error: { message: "Product not found" } });
  return res.json({ data: { ok: true } });
}

/* ---------- Orders ---------- */

/**
 * Road distance from the seller's warehouse to the buyer's plot, if both ends
 * have coordinates and routing is configured. Returns null on anything missing
 * — an order without a distance is normal, not an error.
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

const orderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Order at least 1").max(100000),
  deliveryAddress: z.string().trim().min(10, "Give a full delivery address").max(300),
  phone: z.string().trim().min(6, "Give a contact phone number").max(30),
  note: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  /** Which build it's for. Optional — not every order belongs to a project. */
  projectId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
});

/**
 * POST /api/marketplace/orders — a land owner orders a product. Instant, no
 * approval ladder: the order is PLACED the moment it's submitted.
 */
export async function createOrder(req: Request, res: Response) {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { productId, quantity, deliveryAddress, phone, note, projectId } = parsed.data;

  if (!isValidObjectId(productId)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) {
    return res.status(404).json({ error: { message: "This product is no longer available" } });
  }

  // Snapshot the road distance at order time, so the buyer keeps seeing it on
  // the order afterwards. Deliberately stored rather than re-routed on every
  // read: it burns one ORS call instead of one per page view, and the distance
  // to a plot doesn't change.
  const route = projectId ? await routeForOrder(projectId, req.auth!.sub, product.seller) : null;

  const doc = await MarketOrder.create({
    buyer: req.auth!.sub,
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
  const buyer = doc.buyer as unknown as UserRef;
  notify(String(product.seller), {
    type: NotificationType.ORDER,
    title: `New order, ${quantity} × ${product.name}`,
    body: `${buyer.name} ordered ${quantity} ${product.unit}${quantity > 1 ? "s" : ""} for ৳ ${(
      product.priceBdt * quantity
    ).toLocaleString("en-US")}. Confirm it to start fulfilment.`,
    link: "/marketplace/orders",
    actorId: req.auth!.sub,
  });

  return res.status(201).json({ data: { order: toOrder(doc) } });
}

/**
 * GET /api/marketplace/orders — your orders. Land owners see what they
 * bought; sellers see what they've been asked to fulfil.
 */
export async function listOrders(req: Request, res: Response) {
  const isBuyer = req.auth!.role === UserRole.LAND_OWNER;
  const docs = await MarketOrder.find(
    isBuyer ? { buyer: req.auth!.sub } : { seller: req.auth!.sub }
  )
    .sort({ createdAt: -1 })
    .populate([
      { path: "buyer", select: "name phone" },
      { path: "seller", select: "name profile.company" },
    ]);
  return res.json({ data: { orders: docs.map(toOrder) } });
}

// Fulfilment moves are seller-only; buyers can cancel while still PLACED.
/**
 * The seller's allowed moves.
 *
 * DISPATCHED sits between confirming and delivering because that is the state a
 * buyer actually waits in — "confirmed" can mean anything from an hour to a
 * week, while "on the way" is a promise about today. A seller who loads and
 * delivers in one go can still skip straight to DELIVERED.
 */
const sellerMoves: Record<string, OrderStatus[]> = {
  [OrderStatus.PLACED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DISPATCHED]: [OrderStatus.DELIVERED],
};

/** PATCH /api/marketplace/orders/:id/status — advance or cancel an order. */
export async function updateOrderStatus(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Order not found" } });
  }
  const status = String(req.body?.status ?? "") as OrderStatus;
  if (!Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ error: { message: "Invalid status" } });
  }

  const doc = await MarketOrder.findById(id);
  if (!doc) return res.status(404).json({ error: { message: "Order not found" } });

  const me = req.auth!.sub;
  const isSeller = String(doc.seller) === me;
  const isBuyer = String(doc.buyer) === me;

  const allowed = isSeller
    ? (sellerMoves[doc.status] ?? []).includes(status)
    : isBuyer && doc.status === OrderStatus.PLACED && status === OrderStatus.CANCELLED;
  if (!allowed) {
    return res
      .status(403)
      .json({ error: { message: `Can't move this order from ${doc.status} to ${status}` } });
  }

  // Confirming is where the seller makes the promise, so that's where the date
  // is required. Everything after it inherits the same date unless changed.
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined;
  const expected = req.body?.expectedDeliveryAt;
  if (status === OrderStatus.CONFIRMED) {
    const when = typeof expected === "string" ? new Date(expected) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return res.status(400).json({
        error: { message: "Give the buyer a delivery date when you confirm" },
      });
    }
    // A date in the past is a typo, not a promise.
    if (when.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: { message: "That delivery date is in the past" } });
    }
    doc.expectedDeliveryAt = when;
  } else if (typeof expected === "string" && expected) {
    // A later move may revise the promise — a truck breaks down, dates slip.
    const revised = new Date(expected);
    if (!Number.isNaN(revised.getTime())) doc.expectedDeliveryAt = revised;
  }

  doc.status = status;
  doc.timeline.push({ status, at: new Date(), note });
  await doc.save();
  await doc.populate([
    { path: "buyer", select: "name phone" },
    { path: "seller", select: "name profile.company" },
  ]);

  // Whoever didn't make the move is the one who needs telling.
  const buyer = doc.buyer as unknown as UserRef;
  const seller = doc.seller as unknown as UserRef;
  const recipient = isSeller ? String(buyer._id) : String(seller._id);
  const bodyByStatus: Partial<Record<OrderStatus, string>> = {
    [OrderStatus.CONFIRMED]: `${seller.name} confirmed your order for ${doc.productSnapshot.name}.`,
    [OrderStatus.DISPATCHED]: `${seller.name} has dispatched your ${doc.productSnapshot.name}, it's on the way.`,
    [OrderStatus.DELIVERED]: `${seller.name} marked your order for ${doc.productSnapshot.name} as delivered.`,
    [OrderStatus.CANCELLED]: isSeller
      ? `${seller.name} cancelled your order for ${doc.productSnapshot.name}.`
      : `${buyer.name} cancelled their order for ${doc.productSnapshot.name}.`,
  };
  notify(recipient, {
    type: NotificationType.ORDER,
    title: `Order ${status.toLowerCase()}`,
    body: bodyByStatus[status] ?? `Your order for ${doc.productSnapshot.name} was updated.`,
    link: "/marketplace/orders",
    actorId: me,
  });

  return res.json({ data: { order: toOrder(doc) } });
}

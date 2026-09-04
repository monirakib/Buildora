import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import type { Cart as CartShape, MarketOrder as MarketOrderShape } from "@buildora/shared";
import { Cart } from "../models/Cart";
import { Product } from "../models/Product";
import { placeOrderFor } from "../services/orders";
import { sellerSelect, toOrder, toProduct } from "./marketplace.controller";

/**
 * The buyer's cart, shaped for the client.
 *
 * Reads the cart, drops any line whose listing has since been paused or
 * deleted (and writes that pruning back, so it happens once rather than on
 * every read), and totals what is left.
 */
async function loadCart(userId: string): Promise<CartShape> {
  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { new: true, upsert: true }
  ).populate({ path: "items.product", populate: { path: "seller", select: sellerSelect } });

  // A populated product is a document; a missing one comes back null.
  type Populated = InstanceType<typeof Product> | null;
  const live = cart.items.filter((line) => {
    const product = line.product as unknown as Populated;
    return product != null && product.isActive;
  });

  if (live.length !== cart.items.length) {
    cart.items = live.map((line) => ({
      product: (line.product as unknown as InstanceType<typeof Product>)._id,
      quantity: line.quantity,
      addedAt: line.addedAt,
    }));
    await cart.save();
  }

  const items = live.map((line) => ({
    product: toProduct(line.product as unknown as InstanceType<typeof Product>),
    quantity: line.quantity,
  }));

  return {
    items,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotalBdt: items.reduce((sum, line) => sum + line.quantity * line.product.priceBdt, 0),
  };
}

/** GET /api/marketplace/cart */
export async function getCart(req: Request, res: Response) {
  return res.json({ data: { cart: await loadCart(req.auth!.sub) } });
}

const addSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
});

/**
 * POST /api/marketplace/cart/items — add a product, or add more of one that
 * is already there. Adding is additive: pressing "Add to cart" twice means
 * two, which is what every shop the buyer has ever used does.
 */
export async function addCartItem(req: Request, res: Response) {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { productId, quantity } = parsed.data;
  if (!isValidObjectId(productId)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  const product = await Product.findOne({ _id: productId, isActive: true }).select("_id");
  if (!product) {
    return res.status(404).json({ error: { message: "This product is no longer available" } });
  }

  const cart = await Cart.findOneAndUpdate(
    { user: req.auth!.sub },
    { $setOnInsert: { user: req.auth!.sub, items: [] } },
    { new: true, upsert: true }
  );
  const existing = cart.items.find((line) => String(line.product) === productId);
  if (existing) {
    existing.quantity = Math.min(100000, existing.quantity + quantity);
  } else {
    cart.items.push({ product: product._id, quantity, addedAt: new Date() });
  }
  await cart.save();

  return res.status(201).json({ data: { cart: await loadCart(req.auth!.sub) } });
}

const setSchema = z.object({
  // Zero is allowed here and means "remove": the stepper in the drawer goes
  // down to nothing rather than stopping at one.
  quantity: z.coerce.number().int().min(0).max(100000),
});

/** PATCH /api/marketplace/cart/items/:productId — set a line's quantity. */
export async function setCartItem(req: Request, res: Response) {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { productId } = req.params;
  if (!isValidObjectId(productId)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }

  const cart = await Cart.findOne({ user: req.auth!.sub });
  if (!cart) return res.status(404).json({ error: { message: "Cart is empty" } });

  const line = cart.items.find((item) => String(item.product) === productId);
  if (!line) return res.status(404).json({ error: { message: "That item isn't in your cart" } });

  if (parsed.data.quantity === 0) {
    cart.items = cart.items.filter((item) => String(item.product) !== productId);
  } else {
    line.quantity = parsed.data.quantity;
  }
  await cart.save();

  return res.json({ data: { cart: await loadCart(req.auth!.sub) } });
}

/** DELETE /api/marketplace/cart/items/:productId */
export async function removeCartItem(req: Request, res: Response) {
  const { productId } = req.params;
  if (isValidObjectId(productId)) {
    await Cart.updateOne({ user: req.auth!.sub }, { $pull: { items: { product: productId } } });
  }
  return res.json({ data: { cart: await loadCart(req.auth!.sub) } });
}

/** DELETE /api/marketplace/cart — empty it. */
export async function clearCart(req: Request, res: Response) {
  await Cart.updateOne({ user: req.auth!.sub }, { $set: { items: [] } });
  return res.json({ data: { cart: await loadCart(req.auth!.sub) } });
}

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const checkoutSchema = z.object({
  deliveryAddress: z.string().trim().min(10, "Give a full delivery address").max(300),
  phone: z.string().trim().min(6, "Give a contact phone number").max(30),
  note: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  projectId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
});

/**
 * POST /api/marketplace/cart/checkout — turns every line into an order.
 *
 * One address and phone for the whole cart, one order per line (see
 * placeOrderFor for why). Lines whose product vanished between adding and
 * checking out are skipped rather than failing the whole checkout; the
 * response says what was actually ordered.
 */
export async function checkoutCart(req: Request, res: Response) {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } });
  }
  const { deliveryAddress, phone, note, projectId } = parsed.data;

  const cart = await Cart.findOne({ user: req.auth!.sub });
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ error: { message: "Your cart is empty" } });
  }

  const orders: MarketOrderShape[] = [];
  for (const line of cart.items) {
    const product = await Product.findOne({ _id: line.product, isActive: true });
    if (!product) continue;
    const doc = await placeOrderFor({
      buyerId: req.auth!.sub,
      product,
      quantity: line.quantity,
      deliveryAddress,
      phone,
      note,
      projectId,
    });
    orders.push(toOrder(doc));
  }

  if (orders.length === 0) {
    return res
      .status(409)
      .json({ error: { message: "Everything in your cart is no longer available" } });
  }

  // The cart is spent: the orders are the record now.
  cart.items = [];
  await cart.save();

  return res.status(201).json({ data: { orders, cart: await loadCart(req.auth!.sub) } });
}

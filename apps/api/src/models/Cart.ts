import { Schema, model, Types } from "mongoose";

/**
 * A land owner's marketplace cart: one document per buyer, holding the lines
 * they have added but not yet checked out.
 *
 * Stored server-side rather than in the browser so it follows the buyer
 * between devices, and so a listing that goes inactive while it sits here can
 * be dropped on the next read instead of failing at checkout.
 */
export interface CartItemDoc {
  product: Types.ObjectId;
  quantity: number;
  addedAt: Date;
}

export interface CartDoc {
  user: Types.ObjectId;
  items: CartItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<CartDoc>(
  {
    // One cart per user: the unique index doubles as the lookup key.
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: {
      type: [
        new Schema<CartItemDoc>(
          {
            product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
            // Same ceiling as an order, since every line becomes one.
            quantity: { type: Number, required: true, min: 1, max: 100000 },
            addedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const Cart = model<CartDoc>("Cart", cartSchema);

import { Schema, model, Types } from "mongoose";
import { OrderStatus } from "@buildora/shared";

/**
 * A land owner's marketplace order. There is deliberately no approval ladder
 * — ordering is instant; `status` only tracks fulfilment by the seller.
 * The product's name/unit/price are snapshotted at order time so later
 * listing edits don't rewrite order history.
 */
export interface MarketOrderDoc {
  buyer: Types.ObjectId;
  seller: Types.ObjectId;
  product: Types.ObjectId;
  productSnapshot: { name: string; brand?: string; unit: string; priceBdt: number };
  quantity: number;
  totalBdt: number;
  deliveryAddress: string;
  phone: string;
  note?: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const marketOrderSchema = new Schema<MarketOrderDoc>(
  {
    buyer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productSnapshot: {
      name: { type: String, required: true },
      brand: { type: String },
      unit: { type: String, required: true },
      priceBdt: { type: Number, required: true },
    },
    quantity: { type: Number, required: true, min: 1, max: 100000 },
    totalBdt: { type: Number, required: true, min: 1 },
    deliveryAddress: { type: String, required: true, trim: true, maxlength: 300 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    note: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PLACED,
      index: true,
    },
  },
  { timestamps: true }
);

export const MarketOrder = model<MarketOrderDoc>("MarketOrder", marketOrderSchema);

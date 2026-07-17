import { Schema, model, Types } from "mongoose";
import { ProductCategory } from "@buildora/shared";

/**
 * One marketplace listing by a supplier or contractor. Deactivating (rather
 * than deleting) keeps past orders' product references resolvable.
 */
export interface ProductDoc {
  seller: Types.ObjectId;
  name: string;
  brand?: string;
  category: ProductCategory;
  description?: string;
  unit: string;
  priceBdt: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<ProductDoc>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    brand: { type: String, trim: true, maxlength: 80 },
    category: {
      type: String,
      enum: Object.values(ProductCategory),
      required: true,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    priceBdt: { type: Number, required: true, min: 1 },
    imageUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Product = model<ProductDoc>("Product", productSchema);

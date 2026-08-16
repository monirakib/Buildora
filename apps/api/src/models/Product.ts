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
    // Neither `seller` nor `category` is indexed on its own any more — both are
    // leading or covered fields of the compound indexes at the bottom.
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    brand: { type: String, trim: true, maxlength: 80 },
    category: {
      type: String,
      enum: Object.values(ProductCategory),
      required: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    priceBdt: { type: Number, required: true, min: 1 },
    imageUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * The public catalogue: every listing query starts `{ isActive: true }` and
 * sorts newest-first.
 *
 * `isActive` is a boolean, so this index has only two groups and looks weakly
 * selective — but selectivity is not the point here. The value is the second
 * field: within the active listings the entries are already in createdAt order,
 * so a page of twenty is twenty index entries read in sequence, with no sort and
 * no scan of the inactive ones.
 */
productSchema.index({ isActive: 1, createdAt: -1 });

/**
 * The catalogue filtered to one category. Equality fields first (`isActive`,
 * `category`), sort last, so the same "walk a contiguous run" property holds
 * inside a single category.
 *
 * This does not replace the index above: MongoDB can only skip a field in the
 * middle of an index if it can enumerate that field's values, and an unfiltered
 * category query would have to check every category in turn. Keeping both means
 * each query has an index that starts where it starts.
 */
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });

/** A seller's own listings — including inactive ones, so `isActive` is absent here. */
productSchema.index({ seller: 1, createdAt: -1 });

export const Product = model<ProductDoc>("Product", productSchema);

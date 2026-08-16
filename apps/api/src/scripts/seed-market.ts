/**
 * Seeds the marketplace with demo sellers and listings:
 *
 *   - Two SUPPLIER accounts ("brands"): BuildMart Supplies and Metro Hardware.
 *   - ~14 product listings with photos, spread across the two suppliers and
 *     the existing contractor account (Karim Builder).
 *
 * Set SEED_SUPPLIER_PASSWORD to choose the demo sellers' password; without it
 * one is generated and printed once. It used to be the literal "supplier123"
 * written into this file, which meant two live accounts on every deployment
 * shared a password published in the repository.
 *
 * Run from apps/api: `pnpm tsx src/scripts/seed-market.ts`. Safe to re-run —
 * users are matched by email and products by (seller, name), so it upserts
 * instead of duplicating. Note the password only applies to accounts this run
 * creates: an upsert leaves an existing account's password alone.
 */
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { ProductCategory, UserRole, VerificationStatus } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { hashPassword } from "../services/password";

const suppliers = [
  {
    key: "buildmart",
    name: "BuildMart Supplies",
    username: "buildmart",
    email: "buildmart@buildora.local",
    company: "BuildMart Supplies Ltd.",
    verificationStatus: VerificationStatus.APPROVED,
  },
  {
    key: "metro",
    name: "Metro Hardware",
    username: "metrohardware",
    email: "metro@buildora.local",
    company: "Metro Hardware & Electric",
    verificationStatus: VerificationStatus.PENDING_VERIFICATION,
  },
];

// seller: a supplier key above, or "karim" for the existing contractor.
const products = [
  // -- BuildMart (general building materials) --
  {
    seller: "buildmart",
    name: "1st Class Auto Bricks",
    brand: "Mirpur Ceramic",
    category: ProductCategory.BRICKS,
    unit: "1000 pcs",
    priceBdt: 13500,
    imageUrl: "/market/bricks.jpg",
    description:
      "Machine-made auto bricks, uniform size and colour. Delivery within Dhaka included for 5,000+ pcs.",
  },
  {
    seller: "buildmart",
    name: 'Stone Chips 3/4"',
    category: ProductCategory.SAND_AGGREGATE,
    unit: "cft",
    priceBdt: 210,
    imageUrl: "/market/stone-chips.jpg",
    description: "Crushed stone aggregate for RCC casting. Sieved and washed.",
  },
  {
    seller: "buildmart",
    name: "Sylhet Coarse Sand",
    category: ProductCategory.SAND_AGGREGATE,
    unit: "cft",
    priceBdt: 68,
    imageUrl: "/market/sand.jpg",
    description: "FM 2.5+ coarse sand for structural work, sourced from Sylhet.",
  },
  {
    seller: "buildmart",
    name: "Glazed Floor Tiles 24×24",
    brand: "RAK Ceramics",
    category: ProductCategory.TILES,
    unit: "sqft",
    priceBdt: 95,
    imageUrl: "/market/tiles.jpg",
    description: "Scratch-resistant glazed tiles, stock colours. Grade A.",
  },
  {
    seller: "buildmart",
    name: 'GI Pipe 1" (20ft)',
    brand: "National Tubes",
    category: ProductCategory.PLUMBING,
    unit: "piece",
    priceBdt: 1450,
    imageUrl: "/market/pipes.jpg",
    description: "Galvanized iron pipe for water lines, BSTI certified.",
  },
  {
    seller: "buildmart",
    name: "Basin & Bath Fittings Set",
    brand: "Nazma",
    category: ProductCategory.PLUMBING,
    unit: "set",
    priceBdt: 6800,
    imageUrl: "/market/bathroom.jpg",
    description: "Chrome basin mixer, shower set, and angle stops. A full bathroom set.",
  },
  {
    seller: "buildmart",
    name: 'Flush Door Shutter 39"',
    brand: "Partex",
    category: ProductCategory.WOOD,
    unit: "piece",
    priceBdt: 4200,
    imageUrl: "/market/door.jpg",
    description: "Veneered flush door shutter, seasoned core, ready to fit.",
  },

  // -- Metro Hardware (steel, electric, paint) --
  {
    seller: "metro",
    name: "60-Grade Deformed Rebar 16mm",
    brand: "BSRM",
    category: ProductCategory.STEEL,
    unit: "ton",
    priceBdt: 94500,
    imageUrl: "/market/steel.jpg",
    description: "500W grade TMT rebar. Mill test certificate provided with delivery.",
  },
  {
    seller: "metro",
    name: "WeatherCoat Exterior Paint 18L",
    brand: "Berger",
    category: ProductCategory.PAINT,
    unit: "bucket",
    priceBdt: 8200,
    imageUrl: "/market/paint.jpg",
    description: "Weather-resistant exterior emulsion, 10-year warranty range.",
  },
  {
    seller: "metro",
    name: "Copper Wire 1.5mm (90m coil)",
    brand: "BRB Cable",
    category: ProductCategory.ELECTRICAL,
    unit: "coil",
    priceBdt: 3250,
    imageUrl: "/market/wire.jpg",
    description: "BYA insulated 100% copper house wiring cable, fire retardant.",
  },
  {
    seller: "metro",
    name: "LED Bulb 12W (pack of 6)",
    brand: "Walton",
    category: ProductCategory.ELECTRICAL,
    unit: "pack",
    priceBdt: 990,
    imageUrl: "/market/bulb.jpg",
    description: "Daylight 6500K, E27 base, 2-year replacement warranty.",
  },
  {
    seller: "metro",
    name: "Distribution Board 8-way",
    brand: "Havells",
    category: ProductCategory.ELECTRICAL,
    unit: "piece",
    priceBdt: 3900,
    imageUrl: "/market/dboard.jpg",
    description: "Metal-clad DB with MCB slots, suitable for a full floor.",
  },

  // -- Karim Builder (contractor extras) --
  {
    seller: "karim",
    name: "Seasoned Gamari Wood Plank",
    category: ProductCategory.WOOD,
    unit: "cft",
    priceBdt: 1650,
    imageUrl: "/market/lumber.jpg",
    description: "Kiln-dried gamari planks for doors, frames, and furniture work.",
  },
];

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("[seed] MONGODB_URI is not set, can't seed without a database.");
    process.exit(1);
  }

  // 1. Upsert the two supplier accounts.
  const sellerIds: Record<string, mongoose.Types.ObjectId> = {};
  const password = process.env.SEED_SUPPLIER_PASSWORD || randomBytes(9).toString("base64url");
  if (!process.env.SEED_SUPPLIER_PASSWORD) {
    console.log(`[seed] Demo supplier password (shown once): ${password}`);
  }
  const passwordHash = await hashPassword(password);
  for (const s of suppliers) {
    const user = await User.findOneAndUpdate(
      { email: s.email },
      {
        $setOnInsert: {
          name: s.name,
          username: s.username,
          email: s.email,
          passwordHash,
          role: UserRole.SUPPLIER,
          verificationStatus: s.verificationStatus,
          profile: { company: s.company },
        },
      },
      { upsert: true, new: true }
    );
    sellerIds[s.key] = user._id;
    console.log(`[seed] supplier ready: ${s.name} (${user._id})`);
  }

  // The existing demo contractor also sells.
  const karim = await User.findOne({ role: UserRole.CONTRACTOR });
  if (karim) sellerIds.karim = karim._id;

  // 2. Upsert products by (seller, name).
  let created = 0;
  for (const p of products) {
    const sellerId = sellerIds[p.seller];
    if (!sellerId) {
      console.warn(`[seed] skipping "${p.name}", no ${p.seller} account found`);
      continue;
    }
    const { seller: _key, ...fields } = p;
    const res = await Product.updateOne(
      { seller: sellerId, name: p.name },
      { $set: { ...fields, seller: sellerId, isActive: true } },
      { upsert: true }
    );
    if (res.upsertedCount) created++;
  }

  // 3. Give Karim's original cement listing its photo.
  await Product.updateOne(
    { name: "Portland Cement 50kg" },
    { $set: { imageUrl: "/market/cement-bags.jpg" } }
  );

  console.log(`[seed] done, ${created} new products, ${products.length - created} updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});

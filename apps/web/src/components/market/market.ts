import { OrderStatus, ProductCategory } from "@buildora/shared";

/** Human labels for the product category filter chips and forms. */
export const categoryLabels: Record<ProductCategory, string> = {
  [ProductCategory.CEMENT]: "Cement",
  [ProductCategory.STEEL]: "Steel & rod",
  [ProductCategory.BRICKS]: "Bricks & blocks",
  [ProductCategory.SAND_AGGREGATE]: "Sand & aggregate",
  [ProductCategory.TILES]: "Tiles & marble",
  [ProductCategory.PAINT]: "Paint",
  [ProductCategory.ELECTRICAL]: "Electrical",
  [ProductCategory.PLUMBING]: "Plumbing",
  [ProductCategory.WOOD]: "Wood & doors",
  [ProductCategory.OTHER]: "Other",
};

/** Status chip styling per order state. */
export const statusStyles: Record<OrderStatus, string> = {
  [OrderStatus.PLACED]: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  [OrderStatus.CONFIRMED]: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  [OrderStatus.DISPATCHED]:
    "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  [OrderStatus.DELIVERED]:
    "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  [OrderStatus.CANCELLED]: "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

export const statusLabels: Record<OrderStatus, string> = {
  [OrderStatus.PLACED]: "Placed",
  [OrderStatus.CONFIRMED]: "Confirmed",
  [OrderStatus.DISPATCHED]: "On the way",
  [OrderStatus.DELIVERED]: "Delivered",
  [OrderStatus.CANCELLED]: "Cancelled",
};

/** "৳1,250" — BDT with thousands separators. */
export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-IN")}`;
}

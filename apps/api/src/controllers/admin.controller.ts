import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import {
  BROADCAST_ALL,
  NotificationType,
  OrderStatus,
  PaymentKind,
  ProjectStatus,
  UserRole,
  VerificationStatus,
  type AdminActivityItem,
  type AdminOverview,
  type AdminUserRow,
  type Broadcast as BroadcastShape,
  type DayPoint,
  type MarketOrder as MarketOrderShape,
  type Paginated,
  type Product as ProductShape,
} from "@buildora/shared";
import { User } from "../models/User";
import { Broadcast } from "../models/Broadcast";
import { Session, sessionCutoffs } from "../models/Session";
import { Project } from "../models/Project";
import { Proposal } from "../models/Proposal";
import { Contract } from "../models/Contract";
import { Inquiry } from "../models/Inquiry";
import { Message } from "../models/Message";
import { Product } from "../models/Product";
import { MarketOrder } from "../models/MarketOrder";
import { VerificationRequest } from "../models/VerificationRequest";
import { notifyMany } from "../services/notifications";
import { sellerSelect, toOrder, toProduct } from "./marketplace.controller";

// All analytics buckets use Dhaka days, so "today" matches what the team sees.
const TZ = "Asia/Dhaka";

/** A Date rendered as "YYYY-MM-DD" in Dhaka time (en-CA locale = ISO order). */
function dhakaDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Count-per-day for the last `days` days from `model`'s createdAt, zero-filled
 * so charts get a point for every day even when nothing happened.
 */
async function dailySeries(
  model: typeof User | typeof MarketOrder,
  days: number,
  sumField?: string
): Promise<DayPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows: { _id: string; count: number; totalBdt?: number }[] = await model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
        count: { $sum: 1 },
        ...(sumField ? { totalBdt: { $sum: `$${sumField}` } } : {}),
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const series: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dhakaDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    const row = byDay.get(day);
    series.push({
      date: day,
      count: row?.count ?? 0,
      ...(sumField ? { totalBdt: row?.totalBdt ?? 0 } : {}),
    });
  }
  return series;
}

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.LAND_OWNER]: "Land owner",
  [UserRole.ARCHITECT]: "Architect",
  [UserRole.STRUCTURAL_ENGINEER]: "Structural engineer",
  [UserRole.CONTRACTOR]: "Contractor",
  [UserRole.SUPPLIER]: "Supplier",
  [UserRole.ADMIN]: "Admin",
};

/**
 * GET /api/admin/overview — every number on the admin dashboard, computed live
 * from the database in one round trip. Counts and sums run in parallel; the
 * activity feed merges the four newest-things queries and re-sorts by time.
 */
export async function getOverview(_req: Request, res: Response) {
  const now = Date.now();
  const min15 = new Date(now - 15 * 60 * 1000);
  const h24 = new Date(now - 24 * 60 * 60 * 1000);

  const [
    users,
    landOwners,
    verifiedProfessionals,
    projects,
    proposals,
    contracts,
    inquiries,
    messages,
    products,
    activeProducts,
    orders,
    pendingVerifications,
    activeSessions,
    logins24h,
    usersByRole,
    projectsByStatus,
    ordersByStatus,
    paymentsByKind,
    commissionAgg,
    gmvAgg,
    signupsByDay,
    ordersByDay,
    recentUsers,
    recentOrders,
    recentProjects,
    recentVerifications,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: UserRole.LAND_OWNER }),
    User.countDocuments({
      role: { $nin: [UserRole.LAND_OWNER, UserRole.ADMIN] },
      verificationStatus: VerificationStatus.APPROVED,
    }),
    Project.countDocuments(),
    Proposal.countDocuments(),
    Contract.countDocuments(),
    Inquiry.countDocuments(),
    Message.countDocuments(),
    Product.countDocuments(),
    Product.countDocuments({ isActive: true }),
    MarketOrder.countDocuments(),
    VerificationRequest.countDocuments({ status: VerificationStatus.UNDER_REVIEW }),
    Session.countDocuments({ revokedAt: null, lastSeenAt: { $gte: min15 } }),
    Session.countDocuments({ createdAt: { $gte: h24 } }),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    Project.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    MarketOrder.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    // Sum every ledger entry across contracts, grouped by what it was for.
    Contract.aggregate([
      { $unwind: "$payments" },
      { $group: { _id: "$payments.kind", totalBdt: { $sum: "$payments.amountBdt" } } },
    ]),
    Contract.aggregate([{ $group: { _id: null, totalBdt: { $sum: "$commissionBdt" } } }]),
    MarketOrder.aggregate([
      { $match: { status: { $ne: OrderStatus.CANCELLED } } },
      { $group: { _id: null, totalBdt: { $sum: "$totalBdt" } } },
    ]),
    dailySeries(User, 30),
    dailySeries(MarketOrder, 30, "totalBdt"),
    User.find().sort({ createdAt: -1 }).limit(6).select("name role createdAt"),
    MarketOrder.find().sort({ createdAt: -1 }).limit(6).populate("buyer", "name"),
    Project.find().sort({ createdAt: -1 }).limit(6).populate("owner", "name"),
    VerificationRequest.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate("professional", "name role"),
  ]);

  const payments = new Map<string, number>(
    (paymentsByKind as { _id: string; totalBdt: number }[]).map((p) => [p._id, p.totalBdt])
  );
  const deposits = payments.get(PaymentKind.ESCROW_DEPOSIT) ?? 0;
  const releases = payments.get(PaymentKind.ESCROW_RELEASE) ?? 0;
  const refunds = payments.get(PaymentKind.REFUND) ?? 0;

  // Merge the four "latest" lists into one feed, newest first.
  const activity: AdminActivityItem[] = [
    ...recentUsers.map((u) => ({
      kind: "signup" as const,
      text: `${u.name} joined as ${ROLE_LABELS[u.role].toLowerCase()}`,
      at: u.createdAt.toISOString(),
    })),
    ...recentOrders.map((o) => ({
      kind: "order" as const,
      text: `${(o.buyer as unknown as { name: string }).name} ordered ${o.quantity}× ${o.productSnapshot.name}`,
      at: o.createdAt.toISOString(),
    })),
    ...recentProjects.map((p) => ({
      kind: "project" as const,
      text: `${(p.owner as unknown as { name: string }).name} posted “${p.title}”`,
      at: p.createdAt.toISOString(),
    })),
    ...recentVerifications.map((v) => ({
      kind: "verification" as const,
      text: `${(v.professional as unknown as { name: string }).name} requested verification`,
      at: v.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const professionals =
    users -
    landOwners -
    ((usersByRole as { _id: UserRole; count: number }[]).find((r) => r._id === UserRole.ADMIN)
      ?.count ?? 0);

  const overview: AdminOverview = {
    totals: {
      users,
      landOwners,
      professionals,
      verifiedProfessionals,
      projects,
      proposals,
      contracts,
      inquiries,
      messages,
      products,
      activeProducts,
      orders,
      pendingVerifications,
      activeSessions,
      logins24h,
    },
    finance: {
      conceptFeesBdt: payments.get(PaymentKind.CONCEPT_FEE) ?? 0,
      escrowHeldBdt: Math.max(0, deposits - releases - refunds),
      releasedToArchitectsBdt: releases,
      commissionBdt: (commissionAgg as { totalBdt: number }[])[0]?.totalBdt ?? 0,
      marketplaceGmvBdt: (gmvAgg as { totalBdt: number }[])[0]?.totalBdt ?? 0,
    },
    usersByRole: Object.values(UserRole).map((role) => ({
      role,
      count:
        (usersByRole as { _id: UserRole; count: number }[]).find((r) => r._id === role)?.count ?? 0,
    })),
    projectsByStatus: Object.values(ProjectStatus)
      .map((status) => ({
        status,
        count:
          (projectsByStatus as { _id: ProjectStatus; count: number }[]).find(
            (r) => r._id === status
          )?.count ?? 0,
      }))
      .filter((r) => r.count > 0),
    ordersByStatus: Object.values(OrderStatus).map((status) => ({
      status,
      count:
        (ordersByStatus as { _id: OrderStatus; count: number }[]).find((r) => r._id === status)
          ?.count ?? 0,
    })),
    signupsByDay,
    ordersByDay,
    activity,
  };

  return res.json({ data: { overview } });
}

/* ---------- User management ---------- */

const USERS_PAGE_SIZE = 20;

/**
 * GET /api/admin/users?search=&role=&page= — the user-management table.
 * Session info (last active, live logins) comes from a second query over the
 * page's user ids, so the main query stays a plain find.
 */
export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);

  const filter: Record<string, unknown> = {};
  const role = String(req.query.role ?? "");
  if (Object.values(UserRole).includes(role as UserRole)) filter.role = role;

  const search = String(req.query.search ?? "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { username: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  const [total, docs] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * USERS_PAGE_SIZE)
      .limit(USERS_PAGE_SIZE)
      .select("name username email phone role verificationStatus profile.avatarUrl createdAt"),
  ]);

  // One aggregation over this page's users: latest activity + live login count.
  const ids = docs.map((d) => d._id);
  // "Active" has to mean the same thing here as it does in requireAuth, so a
  // login that timed out isn't still listed as open.
  const { usedSince, startedSince } = sessionCutoffs();
  const sessionRows: { _id: Types.ObjectId; lastSeenAt: Date; active: number }[] =
    await Session.aggregate([
      { $match: { user: { $in: ids } } },
      {
        $group: {
          _id: "$user",
          lastSeenAt: { $max: "$lastSeenAt" },
          active: {
            $sum: {
              $cond: [
                {
                  $and: [
                    // $ifNull: sessions that were never revoked have no
                    // revokedAt field at all, and in aggregation expressions
                    // "missing" ≠ null — so normalise before comparing.
                    { $eq: [{ $ifNull: ["$revokedAt", null] }, null] },
                    { $gt: ["$lastSeenAt", usedSince] },
                    { $gt: ["$createdAt", startedSince] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
  const sessionsByUser = new Map(sessionRows.map((r) => [String(r._id), r]));

  const items: AdminUserRow[] = docs.map((u) => {
    const s = sessionsByUser.get(String(u._id));
    return {
      id: String(u._id),
      name: u.name,
      username: u.username,
      email: u.email,
      phone: u.phone,
      role: u.role,
      verificationStatus: u.verificationStatus,
      avatarUrl: u.profile?.avatarUrl,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: s?.lastSeenAt?.toISOString(),
      activeSessions: s?.active ?? 0,
    };
  });

  const result: Paginated<AdminUserRow> = { items, total, page, pageSize: USERS_PAGE_SIZE };
  return res.json({ data: result });
}

const roleSchema = z.object({
  role: z.enum(UserRole, { message: "Choose a valid role" }),
});

/**
 * PATCH /api/admin/users/:id/role — reassign a user's role. The JWT carries
 * the role, so every session of that user is revoked afterwards — they sign
 * back in and get a token with the new role. Admins can't change their own
 * role (no locking yourself out of the console).
 */
export async function updateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  if (req.auth!.sub === id) {
    return res.status(400).json({ error: { message: "You can't change your own role" } });
  }
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { message: parsed.error.issues[0]?.message ?? "Invalid input" },
    });
  }

  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  user.role = parsed.data.role;
  await user.save();

  // Kill their live logins — their old tokens still claim the old role.
  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  return res.json({ data: { ok: true, role: user.role } });
}

/** POST /api/admin/users/:id/revoke-sessions — force-sign-out everywhere. */
export async function revokeUserSessions(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  const result = await Session.updateMany(
    { user: id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return res.json({ data: { ok: true, revoked: result.modifiedCount } });
}

/* ---------- Marketplace moderation ---------- */

const MARKET_PAGE_SIZE = 20;

/**
 * GET /api/admin/market/products — every listing, active or not (the public
 * catalogue hides delisted ones; moderation needs to see everything).
 */
export async function listAllProducts(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);

  const filter: Record<string, unknown> = {};
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { brand: { $regex: safe, $options: "i" } },
    ];
  }

  const [total, docs] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * MARKET_PAGE_SIZE)
      .limit(MARKET_PAGE_SIZE)
      .populate("seller", sellerSelect),
  ]);

  const result: Paginated<ProductShape> = {
    items: docs.map(toProduct),
    total,
    page,
    pageSize: MARKET_PAGE_SIZE,
  };
  return res.json({ data: result });
}

/**
 * PATCH /api/admin/market/products/:id — delist or relist a product.
 * Deactivation, never deletion — past orders keep their references.
 */
export async function setProductActive(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "isActive must be true or false" } });
  }
  const product = await Product.findByIdAndUpdate(
    id,
    { isActive: parsed.data.isActive },
    { new: true }
  ).populate("seller", sellerSelect);
  if (!product) {
    return res.status(404).json({ error: { message: "Product not found" } });
  }
  return res.json({ data: { product: toProduct(product) } });
}

/** GET /api/admin/market/orders — every marketplace order, newest first. */
export async function listAllOrders(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);

  const filter: Record<string, unknown> = {};
  const status = String(req.query.status ?? "");
  if (Object.values(OrderStatus).includes(status as OrderStatus)) filter.status = status;

  const [total, docs] = await Promise.all([
    MarketOrder.countDocuments(filter),
    MarketOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * MARKET_PAGE_SIZE)
      .limit(MARKET_PAGE_SIZE)
      .populate("buyer", "name phone")
      .populate("seller", "name profile.company"),
  ]);

  const result: Paginated<MarketOrderShape> = {
    items: docs.map(toOrder),
    total,
    page,
    pageSize: MARKET_PAGE_SIZE,
  };
  return res.json({ data: result });
}

/* ---------- Announcements (promotional + system broadcasts) ---------- */

const broadcastSchema = z.object({
  type: z.enum([NotificationType.PROMOTION, NotificationType.SYSTEM], {
    message: "Choose promotional or system",
  }),
  title: z.string().trim().min(3, "Give the announcement a headline").max(140),
  body: z.string().trim().min(10, "Write the announcement body").max(500),
  // An in-app path like "/marketplace". Kept optional — plenty of announcements
  // have nothing to click through to.
  link: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z
      .string()
      .trim()
      .max(300)
      .refine((v) => v.startsWith("/"), "The link must be an in-app path starting with /")
      .optional()
  ),
  audience: z.enum([BROADCAST_ALL, ...Object.values(UserRole)], {
    message: "Choose who receives this",
  }),
});

/** Shapes a broadcast (with sentBy populated) for the console. */
function toBroadcast(doc: InstanceType<typeof Broadcast>): BroadcastShape {
  const sender = doc.sentBy as unknown as { _id: unknown; name?: string };
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    audience: doc.audience as BroadcastShape["audience"],
    recipients: doc.recipients,
    // A deleted admin account leaves the campaign behind; don't lose the row.
    sentBy: { id: String(sender?._id ?? ""), name: sender?.name ?? "Removed admin" },
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * POST /api/admin/broadcasts — send an announcement.
 *
 * The audience is resolved to real user ids, then one notification row is
 * written per recipient (that's the copy each person reads and dismisses).
 * The campaign itself is stored too, so the console can show a send history.
 * Admins are excluded from "everyone" — a promo aimed at users shouldn't fill
 * the sender's own bell.
 */
export async function sendBroadcast(req: Request, res: Response) {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { type, title, body, link, audience } = parsed.data;

  const filter =
    audience === BROADCAST_ALL ? { role: { $ne: UserRole.ADMIN } } : { role: audience };
  const recipients = await User.find(filter).select("_id");
  if (recipients.length === 0) {
    return res.status(400).json({ error: { message: "No users match that audience" } });
  }

  const sent = await notifyMany(
    recipients.map((u) => u._id.toString()),
    { type, title, body, link, actorId: req.auth!.sub }
  );

  const record = await Broadcast.create({
    type,
    title,
    body,
    link,
    audience,
    recipients: sent,
    sentBy: req.auth!.sub,
  });
  await record.populate("sentBy", "name");

  return res.status(201).json({ data: { broadcast: toBroadcast(record) } });
}

/** GET /api/admin/broadcasts — what's been sent, newest first. */
export async function listBroadcasts(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const [total, docs] = await Promise.all([
    Broadcast.countDocuments(),
    Broadcast.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * MARKET_PAGE_SIZE)
      .limit(MARKET_PAGE_SIZE)
      .populate("sentBy", "name"),
  ]);

  const result: Paginated<BroadcastShape> = {
    items: docs.map(toBroadcast),
    total,
    page,
    pageSize: MARKET_PAGE_SIZE,
  };
  return res.json({ data: result });
}

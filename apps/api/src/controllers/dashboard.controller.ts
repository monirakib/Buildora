import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import {
  BidStatus,
  DisputeStatus,
  InquiryStatus,
  MeetingStatus,
  MilestoneStatus,
  OrderStatus,
  PaymentKind,
  ProjectStatus,
  ProposalStatus,
  StructuralStatus,
  TenderStatus,
  UserRole,
  VerificationStatus,
  type DashboardAttention,
  type DashboardProjectRow,
  type DashboardStat,
  type DashboardSummary,
  type DashboardUpcoming,
} from "@buildora/shared";
import { Bid } from "../models/Bid";
import { BuildContract } from "../models/BuildContract";
import { Contract } from "../models/Contract";
import { Conversation } from "../models/Conversation";
import { Dispute } from "../models/Dispute";
import { Inquiry } from "../models/Inquiry";
import { MarketOrder } from "../models/MarketOrder";
import { Meeting } from "../models/Meeting";
import { Message } from "../models/Message";
import { Milestone } from "../models/Milestone";
import { Notification, type NotificationDoc } from "../models/Notification";
import { Product } from "../models/Product";
import { Project } from "../models/Project";
import { Proposal } from "../models/Proposal";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { Tender } from "../models/Tender";
import { User } from "../models/User";
import { VerificationRequest } from "../models/VerificationRequest";
import { toNotificationDto } from "../services/notifications";

/**
 * GET /api/dashboard/summary — one round trip for everything the dashboard
 * shows, computed for the caller's role.
 *
 * Every figure here is a count or a sum over the real collections; nothing is
 * cached or estimated. The dashboard is the first thing a user sees after
 * signing in, and the honest version of "where do things stand" is a query,
 * not a stored number that can drift.
 */

const IN_FLIGHT_ORDER = [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.DISPATCHED];
const LIVE_MEETING = [MeetingStatus.CONFIRMED, MeetingStatus.PENDING_VENUE];

/** Escrow that has been deposited and not yet released or refunded. */
function heldFromPayments(payments: { kind: string; amountBdt: number }[]): number {
  return payments.reduce((sum, p) => {
    if (p.kind === PaymentKind.ESCROW_DEPOSIT) return sum + p.amountBdt;
    if (p.kind === PaymentKind.ESCROW_RELEASE || p.kind === PaymentKind.REFUND)
      return sum - p.amountBdt;
    return sum;
  }, 0);
}

/** Sum of escrow held across the design, structural and build ledgers. */
async function escrowHeldFor(filter: Record<string, unknown>): Promise<number> {
  const [design, structural, build] = await Promise.all([
    Contract.find(filter).select("payments"),
    StructuralEngagement.find(filter).select("payments"),
    BuildContract.find(filter).select("payments"),
  ]);
  const all = [...design, ...structural, ...build];
  return Math.max(
    0,
    all.reduce(
      (sum, doc) => sum + heldFromPayments(doc.payments as { kind: string; amountBdt: number }[]),
      0
    )
  );
}

/** Messages addressed to `me` that have not been opened, across every thread. */
async function unreadMessagesFor(me: string): Promise<number> {
  const threads = await Conversation.find({ $or: [{ userA: me }, { userB: me }] }).select("_id");
  if (threads.length === 0) return 0;
  return Message.countDocuments({
    conversation: { $in: threads.map((t) => t._id) },
    sender: { $ne: me },
    readAt: null,
  });
}

/** The newest notifications, as the activity feed. */
async function activityFor(me: string) {
  const docs = await Notification.find({ user: me })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate("actor", "name profile.avatarUrl");
  return docs.map((d) => toNotificationDto(d as HydratedDocument<NotificationDoc>));
}

function toRow(doc: {
  _id: unknown;
  title: string;
  areaName: string;
  status: ProjectStatus;
  updatedAt: Date;
  coverImageUrl?: string;
}): DashboardProjectRow {
  return {
    id: String(doc._id),
    title: doc.title,
    areaName: doc.areaName,
    status: doc.status,
    updatedAt: doc.updatedAt.toISOString(),
    coverImageUrl: doc.coverImageUrl,
  };
}

const projectSelect = "title areaName status updatedAt coverImageUrl";

/** Upcoming meetings for whichever side of the table the caller sits on. */
async function meetingsFor(field: "landOwner" | "architect", me: string) {
  const other = field === "landOwner" ? "architect" : "landOwner";
  const filter: Record<string, unknown> = {
    [field]: me,
    status: { $in: LIVE_MEETING },
    startAt: { $gte: new Date() },
  };
  const docs = await Meeting.find(filter).sort({ startAt: 1 }).limit(3).populate(other, "name");
  return docs.map<DashboardUpcoming>((m) => {
    const who = m[other] as unknown as { name: string };
    return {
      id: String(m._id),
      title: `Meeting with ${who?.name ?? "your architect"}`,
      detail: m.status === MeetingStatus.PENDING_VENUE ? "Venue still to agree" : "Confirmed",
      at: m.startAt.toISOString(),
      href: "/meetings",
    };
  });
}

/** Milestones with a target date on the given projects, soonest first. */
async function milestonesFor(projectIds: unknown[]) {
  if (projectIds.length === 0) return [] as DashboardUpcoming[];
  const filter: Record<string, unknown> = {
    project: { $in: projectIds },
    status: {
      $in: [
        MilestoneStatus.FUNDED,
        MilestoneStatus.AWAITING_INSPECTION,
        MilestoneStatus.INSPECTION_PASSED,
      ],
    },
    targetDate: { $ne: null },
  };
  const docs = await Milestone.find(filter)
    .sort({ targetDate: 1 })
    .limit(3)
    .populate("project", "title");
  return docs.map<DashboardUpcoming>((m) => ({
    id: String(m._id),
    title: m.title,
    detail: (m.project as unknown as { title: string })?.title ?? "Milestone",
    at: m.targetDate!.toISOString(),
    href: `/projects/${String((m.project as unknown as { _id: unknown })._id)}`,
  }));
}

/** "Two proposals are waiting on you." — the first thing the dashboard says. */
function headlineFrom(attention: DashboardAttention[], fallback: string): string {
  const top = attention.find((a) => a.count > 0);
  if (!top) return fallback;
  const n = top.count;
  return `${n === 1 ? "One" : n} ${top.label.toLowerCase()}${n === 1 ? " is" : " are"} waiting on you.`;
}

/* ---------- Land owner ---------- */

async function landOwnerSummary(me: string): Promise<Omit<DashboardSummary, "firstName" | "role">> {
  const projects = await Project.find({ owner: me }).sort({ updatedAt: -1 }).select(projectSelect);
  const ids = projects.map((p) => p._id);
  const active = projects.filter(
    (p) => p.status !== ProjectStatus.COMPLETED && p.status !== ProjectStatus.ARCHIVED
  ).length;

  const [proposals, escrow, unread, orders, toRelease, meetings, milestones, activity] =
    await Promise.all([
      ids.length
        ? Proposal.countDocuments({ project: { $in: ids }, status: ProposalStatus.PENDING })
        : 0,
      escrowHeldFor({ client: me }),
      unreadMessagesFor(me),
      MarketOrder.countDocuments({ buyer: me, status: { $in: IN_FLIGHT_ORDER } }),
      ids.length
        ? Milestone.countDocuments({
            project: { $in: ids },
            status: MilestoneStatus.INSPECTION_PASSED,
          })
        : 0,
      meetingsFor("landOwner", me),
      milestonesFor(ids),
      activityFor(me),
    ]);

  const stats: DashboardStat[] = [
    {
      key: "projects",
      label: "Active projects",
      value: active,
      hint: `${projects.length} in total`,
      href: "/projects",
    },
    {
      key: "escrow",
      label: "Held in escrow",
      value: escrow,
      unit: "bdt",
      hint: "Released only on approval",
      href: "/projects",
    },
    { key: "proposals", label: "Proposals waiting", value: proposals, href: "/projects" },
    { key: "orders", label: "Orders on the way", value: orders, href: "/marketplace/orders" },
  ];

  const attention: DashboardAttention[] = [
    { key: "proposals", label: "Proposals to review", count: proposals, href: "/projects" },
    { key: "release", label: "Passed inspections to release", count: toRelease, href: "/projects" },
    { key: "messages", label: "Unread messages", count: unread, href: "/messages" },
  ];

  return {
    headline: headlineFrom(
      attention,
      projects.length === 0
        ? "Post your first brief and let verified architects come to you."
        : "Everything is moving. Nothing needs you right now."
    ),
    stats,
    projects: projects.slice(0, 5).map(toRow),
    upcoming: [...meetings, ...milestones].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 4),
    attention,
    activity,
  };
}

/* ---------- Professionals ---------- */

async function professionalSummary(
  me: string,
  role: UserRole
): Promise<Omit<DashboardSummary, "firstName" | "role">> {
  const field =
    role === UserRole.STRUCTURAL_ENGINEER
      ? "engineer"
      : role === UserRole.CONTRACTOR
        ? "contractor"
        : "architect";
  const projects = await Project.find({ [field]: me })
    .sort({ updatedAt: -1 })
    .select(projectSelect);
  const ids = projects.map((p) => p._id);
  const active = projects.filter(
    (p) => p.status !== ProjectStatus.COMPLETED && p.status !== ProjectStatus.ARCHIVED
  ).length;

  const [inquiries, unread, activity] = await Promise.all([
    Inquiry.countDocuments({
      professional: me,
      status: { $in: [InquiryStatus.SENT, InquiryStatus.READ] },
    }),
    unreadMessagesFor(me),
    activityFor(me),
  ]);

  const stats: DashboardStat[] = [
    {
      key: "engagements",
      label: "Active engagements",
      value: active,
      hint: `${projects.length} in total`,
      href: "/projects",
    },
  ];
  const attention: DashboardAttention[] = [
    { key: "inquiries", label: "Client requests to answer", count: inquiries, href: "/inquiries" },
  ];
  let upcoming: DashboardUpcoming[] = [];

  if (role === UserRole.ARCHITECT) {
    const [openBriefs, pending, contracts, meetings] = await Promise.all([
      Project.countDocuments({ status: ProjectStatus.BRIEF_POSTED }),
      Proposal.countDocuments({ architect: me, status: ProposalStatus.PENDING }),
      Contract.find({ architect: me }).select("releasedToArchitectBdt"),
      meetingsFor("architect", me),
    ]);
    const earned = contracts.reduce((s, c) => s + (c.releasedToArchitectBdt ?? 0), 0);
    stats.push(
      { key: "briefs", label: "Open briefs", value: openBriefs, href: "/briefs" },
      { key: "pending", label: "Proposals out", value: pending, hint: "Awaiting a decision" },
      { key: "earned", label: "Released to you", value: earned, unit: "bdt", hint: "From escrow" }
    );
    upcoming = meetings;
  } else if (role === UserRole.CONTRACTOR) {
    const [openTenders, bids, inspections, builds, orders, milestones] = await Promise.all([
      Tender.countDocuments({ status: TenderStatus.OPEN }),
      Bid.countDocuments({
        contractor: me,
        status: { $in: [BidStatus.SUBMITTED, BidStatus.SHORTLISTED] },
      }),
      ids.length
        ? Milestone.countDocuments({
            project: { $in: ids },
            status: MilestoneStatus.AWAITING_INSPECTION,
          })
        : 0,
      BuildContract.find({ contractor: me }).select("releasedToContractorBdt"),
      MarketOrder.countDocuments({ seller: me, status: OrderStatus.PLACED }),
      milestonesFor(ids),
    ]);
    const earned = builds.reduce((s, c) => s + (c.releasedToContractorBdt ?? 0), 0);
    stats.push(
      { key: "tenders", label: "Tenders open", value: openTenders, href: "/tenders" },
      {
        key: "bids",
        label: "Bids in play",
        value: bids,
        hint: "Sealed until closing",
        href: "/tenders",
      },
      { key: "earned", label: "Released to you", value: earned, unit: "bdt", hint: "From escrow" }
    );
    attention.push(
      {
        key: "inspections",
        label: "Milestones awaiting inspection",
        count: inspections,
        href: "/projects",
      },
      { key: "orders", label: "Orders to confirm", count: orders, href: "/marketplace/orders" }
    );
    upcoming = milestones;
  } else if (role === UserRole.STRUCTURAL_ENGINEER) {
    const [drawing, inspections, released] = await Promise.all([
      StructuralEngagement.countDocuments({
        engineer: me,
        status: StructuralStatus.DRAWINGS_IN_PROGRESS,
      }),
      ids.length
        ? Milestone.countDocuments({
            project: { $in: ids },
            status: MilestoneStatus.AWAITING_INSPECTION,
          })
        : 0,
      StructuralEngagement.find({ engineer: me, status: StructuralStatus.COMPLETED }).select("_id"),
    ]);
    stats.push(
      { key: "drawings", label: "Drawing sets due", value: drawing, href: "/engineer" },
      { key: "inspections", label: "Inspections waiting", value: inspections, href: "/engineer" },
      { key: "completed", label: "Sets approved", value: released.length, hint: "All time" }
    );
    attention.push({
      key: "inspections",
      label: "Inspections to sign",
      count: inspections,
      href: "/engineer",
    });
  } else if (role === UserRole.SUPPLIER) {
    const [listings, toFulfil, delivered] = await Promise.all([
      Product.countDocuments({ seller: me, isActive: true }),
      MarketOrder.countDocuments({ seller: me, status: { $in: IN_FLIGHT_ORDER } }),
      MarketOrder.find({ seller: me, status: OrderStatus.DELIVERED }).select("totalBdt"),
    ]);
    const revenue = delivered.reduce((s, o) => s + o.totalBdt, 0);
    const placed = await MarketOrder.countDocuments({ seller: me, status: OrderStatus.PLACED });
    stats.push(
      { key: "listings", label: "Live listings", value: listings, href: "/marketplace/sell" },
      { key: "fulfil", label: "Orders in progress", value: toFulfil, href: "/marketplace/orders" },
      {
        key: "revenue",
        label: "Delivered",
        value: revenue,
        unit: "bdt",
        hint: `${delivered.length} orders`,
      }
    );
    attention.push({
      key: "orders",
      label: "Orders to confirm",
      count: placed,
      href: "/marketplace/orders",
    });
  }

  attention.push({ key: "messages", label: "Unread messages", count: unread, href: "/messages" });

  return {
    headline: headlineFrom(attention, "Your desk is clear. Nothing needs you right now."),
    stats: stats.slice(0, 4),
    projects: projects.slice(0, 5).map(toRow),
    upcoming,
    attention,
    activity,
  };
}

/* ---------- Admin ---------- */

async function adminSummary(me: string): Promise<Omit<DashboardSummary, "firstName" | "role">> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [queue, users, newUsers, disputes, orders, projects, activity] = await Promise.all([
    VerificationRequest.countDocuments({
      status: { $in: [VerificationStatus.DOCUMENTS_SUBMITTED, VerificationStatus.UNDER_REVIEW] },
    }),
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: dayAgo } }),
    Dispute.countDocuments({ status: { $in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } }),
    MarketOrder.countDocuments({ status: { $in: IN_FLIGHT_ORDER } }),
    Project.find().sort({ updatedAt: -1 }).limit(5).select(projectSelect),
    activityFor(me),
  ]);

  const attention: DashboardAttention[] = [
    { key: "queue", label: "Verifications to review", count: queue, href: "/supervisor" },
    { key: "disputes", label: "Open disputes", count: disputes, href: "/admin/disputes" },
  ];

  return {
    headline: headlineFrom(attention, "The platform is quiet. Nothing is waiting on you."),
    stats: [
      { key: "queue", label: "Verification queue", value: queue, href: "/supervisor" },
      {
        key: "users",
        label: "Members",
        value: users,
        hint: `${newUsers} joined today`,
        href: "/admin/users",
      },
      { key: "disputes", label: "Open disputes", value: disputes, href: "/admin/disputes" },
      { key: "orders", label: "Orders in flight", value: orders, href: "/admin/market" },
    ],
    projects: projects.map(toRow),
    upcoming: [],
    attention,
    activity,
  };
}

export async function getDashboardSummary(req: Request, res: Response) {
  const me = req.auth!.sub;
  const role = req.auth!.role;
  const user = await User.findById(me).select("name");
  if (!user) return res.status(404).json({ error: { message: "User not found" } });

  const body =
    role === UserRole.LAND_OWNER
      ? await landOwnerSummary(me)
      : role === UserRole.ADMIN
        ? await adminSummary(me)
        : await professionalSummary(me, role);

  const summary: DashboardSummary = {
    firstName: user.name.split(" ")[0] ?? user.name,
    role,
    ...body,
  };
  return res.json({ data: { summary } });
}

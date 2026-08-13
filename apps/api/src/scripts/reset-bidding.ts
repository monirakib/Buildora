/**
 * Dev-only: wipes the construction bidding trail of one project so the tender
 * flow can be demoed again from scratch, without rebuilding the brief, the
 * architect proposal and the permits that came before it.
 *
 * Removes the tender(s), every bid on them, the awarded build contract with its
 * milestones and change orders, and the tender/bid notifications both sides
 * received. Then it clears `contractor` on the project and rewinds its status
 * to PERMIT_STAGE — exactly the state a cancelled tender leaves behind, which
 * is what "post a new tender" starts from.
 *
 * Everything before the tender (brief, proposals, design contract, permits,
 * documents, messages) is left untouched.
 *
 * Run from apps/api:
 *   pnpm tsx src/scripts/reset-bidding.ts <projectId>          # dry run
 *   pnpm tsx src/scripts/reset-bidding.ts <projectId> --apply  # delete
 */
import mongoose from "mongoose";
import { NotificationType, ProjectStatus } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { Project } from "../models/Project";
import { Tender } from "../models/Tender";
import { Bid } from "../models/Bid";
import { BuildContract } from "../models/BuildContract";
import { Milestone } from "../models/Milestone";
import { ChangeOrder } from "../models/ChangeOrder";
import { Notification } from "../models/Notification";
import { SiteDiaryEntry } from "../models/SiteDiaryEntry";
import { SiteCheckIn } from "../models/SiteCheckIn";
import { Handover } from "../models/Handover";
import { Dispute } from "../models/Dispute";

async function main() {
  const projectId = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!projectId || !mongoose.isValidObjectId(projectId)) {
    console.error("[reset:bidding] Pass a valid project id as the first argument.");
    process.exit(1);
  }

  const connected = await connectDb();
  if (!connected) {
    console.error("[reset:bidding] No database connection — set MONGODB_URI first.");
    process.exit(1);
  }

  const project = await Project.findById(projectId);
  if (!project) {
    console.error(`[reset:bidding] No project ${projectId}.`);
    process.exit(1);
  }
  console.log(`[reset:bidding] Project: ${project.title} (status ${project.status})`);
  console.log(`[reset:bidding] contractor: ${project.contractor?.toString() ?? "none"}`);

  const tenders = await Tender.find({ project: project._id });
  const tenderIds = tenders.map((t) => t._id);
  const bids = await Bid.find({ tender: { $in: tenderIds } });
  const contracts = await BuildContract.find({ project: project._id });
  const contractIds = contracts.map((c) => c._id);
  const milestones = await Milestone.find({
    $or: [{ project: project._id }, { buildContract: { $in: contractIds } }],
  });
  const changeOrders = await ChangeOrder.find({ buildContract: { $in: contractIds } });

  // Notifications carry no foreign keys, only a link, so they're matched on the
  // links these flows write: /tenders/<id> and /projects/<id>. The type filter
  // is what keeps the project link from also sweeping up the design-contract
  // and permit notifications that share it.
  const linkPatterns = [
    ...tenderIds.map((id) => `/tenders/${id.toString()}`),
    `/projects/${project._id.toString()}`,
  ];
  const notifications = await Notification.find({
    link: { $in: linkPatterns.map((p) => new RegExp(`^${p}(/|\\?|$)`)) },
    type: {
      $in: [NotificationType.TENDER, NotificationType.BID, NotificationType.MILESTONE],
    },
  });

  console.log(`[reset:bidding] tenders        ${tenders.length}`);
  for (const t of tenders) console.log(`  - ${t._id} ${t.status} "${t.title}"`);
  console.log(`[reset:bidding] bids           ${bids.length}`);
  for (const b of bids) console.log(`  - ${b._id} ${b.status} ${b.totalBdt} BDT`);
  console.log(`[reset:bidding] buildContracts ${contracts.length}`);
  for (const c of contracts) console.log(`  - ${c._id} ${c.status} ${c.contractSumBdt} BDT`);
  console.log(`[reset:bidding] milestones     ${milestones.length}`);
  console.log(`[reset:bidding] changeOrders   ${changeOrders.length}`);
  console.log(`[reset:bidding] notifications  ${notifications.length}`);

  // Reported but never deleted — these belong to the site, not to the tender.
  const diary = await SiteDiaryEntry.countDocuments({ project: project._id });
  const checkIns = await SiteCheckIn.countDocuments({ project: project._id });
  const handovers = await Handover.countDocuments({ project: project._id });
  const disputes = await Dispute.countDocuments({ project: project._id });
  console.log(
    `[reset:bidding] kept: siteDiary ${diary}, checkIns ${checkIns}, ` +
      `handover ${handovers}, disputes ${disputes}`
  );

  if (!apply) {
    console.log("[reset:bidding] Dry run — nothing deleted. Re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  await Milestone.deleteMany({ _id: { $in: milestones.map((m) => m._id) } });
  await ChangeOrder.deleteMany({ _id: { $in: changeOrders.map((c) => c._id) } });
  await BuildContract.deleteMany({ _id: { $in: contractIds } });
  await Bid.deleteMany({ tender: { $in: tenderIds } });
  await Tender.deleteMany({ _id: { $in: tenderIds } });
  await Notification.deleteMany({ _id: { $in: notifications.map((n) => n._id) } });

  await Project.updateOne(
    { _id: project._id },
    { $unset: { contractor: "" }, $set: { status: ProjectStatus.PERMIT_STAGE } }
  );

  console.log("[reset:bidding] Done — project is back at PERMIT_STAGE with no contractor.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[reset:bidding] failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});

/**
 * Read-only check for the engineer console. Run from apps/api:
 * `pnpm tsx src/scripts/check-engineer-console.ts`
 *
 * Runs exactly the two queries the console's endpoints run — the engagements
 * an engineer is on, and the build contracts plus the milestone schedules that
 * `GET /api/build/mine` now returns alongside them — and prints what each queue
 * would hold. Writes nothing.
 */
import mongoose from "mongoose";
import { MilestoneStatus, StructuralStatus, UserRole } from "@buildora/shared";
import { connectDb } from "../db/mongoose";
import { BuildContract } from "../models/BuildContract";
import { Milestone } from "../models/Milestone";
import { StructuralEngagement } from "../models/StructuralEngagement";
import { User } from "../models/User";

async function main() {
  const connected = await connectDb();
  if (!connected) {
    console.error("No database connection — set MONGODB_URI.");
    process.exitCode = 1;
    return;
  }

  const engineers = await User.find({ role: UserRole.STRUCTURAL_ENGINEER }).select(
    "name email verificationStatus"
  );
  console.log(`\nStructural engineers on this database: ${engineers.length}`);

  for (const engineer of engineers) {
    const engagements = await StructuralEngagement.find({ engineer: engineer._id });
    const contracts = await BuildContract.find({ engineer: engineer._id });
    // The new query in listMyBuildContracts, run verbatim.
    const milestones = await Milestone.find({
      buildContract: { $in: contracts.map((c) => c._id) },
    }).sort({ buildContract: 1, order: 1 });

    const awaiting = milestones.filter((m) => m.status === MilestoneStatus.AWAITING_INSPECTION);
    const live = engagements.filter((e) => e.status === StructuralStatus.DRAWINGS_IN_PROGRESS);

    console.log(
      [
        `\n  ${engineer.name} <${engineer.email}> — ${engineer.verificationStatus}`,
        `    engagements: ${engagements.length} (${live.length} live)`,
        `    build contracts: ${contracts.length}`,
        `    milestones on them: ${milestones.length}`,
        `    awaiting inspection: ${awaiting.length}`,
      ].join("\n")
    );

    for (const m of awaiting) {
      console.log(
        `      → stage ${m.order}: ${m.title} (${m.amountBdt.toLocaleString("en-IN")} BDT)`
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

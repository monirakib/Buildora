/**
 * Every model in one place, so a script can be sure it has them all.
 *
 * This exists because of a specific trap. Mongoose only knows about a model
 * once the file that calls `model()` has actually been imported — and
 * `mongoose.modelNames()` therefore returns "the models someone happened to
 * import", not "the models this app has". `scripts/ensure-indexes.ts` looped
 * over `modelNames()` after importing seven models by hand, so it built indexes
 * for seven collections and silently skipped the other thirty-four.
 *
 * Importing this file registers all of them. `allModels` then gives the index
 * scripts a concrete list to walk, which is a stronger guarantee than
 * `modelNames()` — if a model file is deleted, this stops compiling instead of
 * quietly shrinking the list.
 *
 * **When you add a model, add it here too.** `pnpm report:indexes` cross-checks
 * this list against the collections that actually exist in the database, so a
 * forgotten entry shows up as an unclaimed collection rather than as nothing.
 */
import { AssistantChat } from "./AssistantChat";
import { Availability } from "./Availability";
import { Bid } from "./Bid";
import { BoqRate } from "./BoqRate";
import { Broadcast } from "./Broadcast";
import { BuildContract } from "./BuildContract";
import { Call } from "./Call";
import { ChangeOrder } from "./ChangeOrder";
import { Contract } from "./Contract";
import { Conversation } from "./Conversation";
import { CostEstimateSnapshot } from "./CostEstimateSnapshot";
import { DapZone } from "./DapZone";
import { Dispute } from "./Dispute";
import { EcpsApplication } from "./EcpsApplication";
import { EcpsStep } from "./EcpsStep";
import { EmailVerification } from "./EmailVerification";
import { FeeRule } from "./FeeRule";
import { FloorPlan } from "./FloorPlan";
import { Handover } from "./Handover";
import { Inquiry } from "./Inquiry";
import { InspectionTemplate } from "./InspectionTemplate";
import { KeyRotationRun } from "./KeyRotationRun";
import { MarketOrder } from "./MarketOrder";
import { Meeting } from "./Meeting";
import { Message } from "./Message";
import { Milestone } from "./Milestone";
import { Notification } from "./Notification";
import { PaymentSession } from "./PaymentSession";
import { Product } from "./Product";
import { Project } from "./Project";
import { ProjectDocument } from "./ProjectDocument";
import { Proposal } from "./Proposal";
import { PushSubscription } from "./PushSubscription";
import { Review } from "./Review";
import { Session } from "./Session";
import { SiteCheckIn } from "./SiteCheckIn";
import { SiteDiaryEntry } from "./SiteDiaryEntry";
import { StructuralEngagement } from "./StructuralEngagement";
import { StudioDesign } from "./StudioDesign";
import { StudioVersion } from "./StudioVersion";
import { Tender } from "./Tender";
import { User } from "./User";
import { VerificationRequest } from "./VerificationRequest";

/**
 * The scripts only ever read `.modelName` / `.collection` and call
 * `createIndexes()` — all of which every model has regardless of its document
 * type, so the inferred union type is enough and no cast is needed.
 */
export const allModels = [
  AssistantChat,
  Availability,
  Bid,
  BoqRate,
  Broadcast,
  BuildContract,
  Call,
  ChangeOrder,
  Contract,
  Conversation,
  CostEstimateSnapshot,
  DapZone,
  Dispute,
  EcpsApplication,
  EcpsStep,
  EmailVerification,
  FeeRule,
  FloorPlan,
  Handover,
  Inquiry,
  InspectionTemplate,
  KeyRotationRun,
  MarketOrder,
  Meeting,
  Message,
  Milestone,
  Notification,
  PaymentSession,
  Product,
  Project,
  ProjectDocument,
  Proposal,
  PushSubscription,
  Review,
  Session,
  SiteCheckIn,
  SiteDiaryEntry,
  StructuralEngagement,
  StudioDesign,
  StudioVersion,
  Tender,
  User,
  VerificationRequest,
];

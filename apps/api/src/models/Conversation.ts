import { Schema, model, Types } from "mongoose";

/**
 * A two-person message thread. The pair is stored sorted (`userA` < `userB`
 * by id string) so the unique index finds the same conversation no matter
 * which side opens it. `lastMessageAt` orders the inbox.
 */
export interface ConversationDoc {
  userA: Types.ObjectId;
  userB: Types.ObjectId;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDoc>(
  {
    userA: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userB: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One conversation per pair of users.
conversationSchema.index({ userA: 1, userB: 1 }, { unique: true });
// Inbox queries: "conversations I'm in, newest activity first".
conversationSchema.index({ userA: 1, lastMessageAt: -1 });
conversationSchema.index({ userB: 1, lastMessageAt: -1 });

/** Returns the pair in canonical (sorted) order for lookups and creates. */
export function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export const Conversation = model<ConversationDoc>("Conversation", conversationSchema);

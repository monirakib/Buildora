import { Schema, model, Types } from "mongoose";

/**
 * One chat message inside a conversation. `readAt` stays unset until the
 * recipient opens the thread — unread counts are messages sent by the other
 * side with no `readAt`.
 */
export interface MessageDoc {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDoc>(
  {
    // Not indexed on its own — both indexes below start with it.
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * Reading a thread, and finding a thread's most recent message for the inbox
 * preview.
 *
 * Both are the same access pattern — one conversation's messages in date order
 * — so one index serves them. Opening a thread reads it forwards; the inbox
 * preview wants only the newest, which is this index read backwards and stopped
 * after one entry. An index can be walked in either direction, so the stored
 * direction does not need to match both.
 *
 * Before this, the only index was on `conversation` alone, which found the
 * thread's messages but left them to be sorted in memory on every read.
 */
messageSchema.index({ conversation: 1, createdAt: -1 });

/**
 * The unread badge: messages in this thread, from the other person, not yet
 * read — `{ conversation, sender: { $ne: me }, readAt: null }`.
 *
 * `conversation` and `readAt` are both matched exactly (null is a value to match
 * here, not a range), so they lead. `sender` comes last because `$ne` is a
 * negation: an index cannot seek to "everything except this one value", so it
 * can only be used to filter entries already found. Putting it earlier would
 * have widened the scan instead of narrowing it.
 */
messageSchema.index({ conversation: 1, readAt: 1, sender: 1 });

export const Message = model<MessageDoc>("Message", messageSchema);

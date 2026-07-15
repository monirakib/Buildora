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
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date },
  },
  { timestamps: true }
);

export const Message = model<MessageDoc>("Message", messageSchema);

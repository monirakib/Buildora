import { Schema, model, Types } from "mongoose";

/**
 * One signed-in user's running conversation with the Buildora Guide
 * assistant. Roles use Gemini's names ("user" / "model") so messages map
 * straight into the API request without translation. Guests chat without a
 * document — their history lives only in the browser.
 */
export interface AssistantChatDoc {
  user: Types.ObjectId;
  messages: { role: "user" | "model"; content: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const assistantChatSchema = new Schema<AssistantChatDoc>(
  {
    // One conversation per user — chat() upserts into it.
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    messages: {
      type: [
        new Schema(
          {
            role: { type: String, enum: ["user", "model"], required: true },
            content: { type: String, required: true, maxlength: 4000 },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const AssistantChat = model<AssistantChatDoc>("AssistantChat", assistantChatSchema);

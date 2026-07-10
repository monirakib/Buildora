import type { Request, Response } from "express";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { z } from "zod";
import type { ChatMessage, Conversation as ConversationDto, UserRole } from "@buildora/shared";
import { Conversation, sortPair, type ConversationDoc } from "../models/Conversation";
import { Message, type MessageDoc } from "../models/Message";
import { User } from "../models/User";

const openConversationSchema = z.object({
  userId: z.string().min(1, "Choose who to message"),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Type a message").max(2000, "Message is too long"),
});

type ParticipantRef = {
  _id: unknown;
  name: string;
  username: string;
  role: UserRole;
  profile?: { avatarUrl?: string };
};

const withParticipants = [
  { path: "userA", select: "name username role profile.avatarUrl" },
  { path: "userB", select: "name username role profile.avatarUrl" },
];

/**
 * Shapes a conversation for the caller: whichever participant isn't the caller
 * becomes `other`, plus a last-message preview and the caller's unread count.
 */
function toConversationDto(
  doc: HydratedDocument<ConversationDoc>,
  callerId: string,
  lastMessage: HydratedDocument<MessageDoc> | null,
  unreadCount: number
): ConversationDto {
  const a = doc.userA as unknown as ParticipantRef;
  const b = doc.userB as unknown as ParticipantRef;
  const other = String(a._id) === callerId ? b : a;
  return {
    id: doc._id.toString(),
    other: {
      id: String(other._id),
      name: other.name,
      username: other.username,
      role: other.role,
      avatarUrl: other.profile?.avatarUrl,
    },
    lastMessage: lastMessage
      ? {
          body: lastMessage.body,
          at: lastMessage.createdAt.toISOString(),
          mine: String(lastMessage.sender) === callerId,
        }
      : undefined,
    unreadCount,
    updatedAt: doc.lastMessageAt.toISOString(),
  };
}

function toChatMessage(doc: HydratedDocument<MessageDoc>, senderName: string): ChatMessage {
  return {
    id: doc._id.toString(),
    senderId: String(doc.sender),
    senderName,
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Loads a conversation the caller belongs to, or answers 404; null after replying. */
// `id` comes straight from req.params, which Express 5 types as string | string[].
async function findMyConversationOr404(
  id: string | string[] | undefined,
  req: Request,
  res: Response
) {
  if (typeof id !== "string" || !isValidObjectId(id)) {
    res.status(404).json({ error: { message: "Conversation not found" } });
    return null;
  }
  const doc = await Conversation.findById(id);
  const me = req.auth!.sub;
  if (!doc || (String(doc.userA) !== me && String(doc.userB) !== me)) {
    res.status(404).json({ error: { message: "Conversation not found" } });
    return null;
  }
  return doc;
}

/**
 * POST /api/messages/conversations — open (or reuse) the thread with another
 * user. The pair is stored sorted, so both sides land on the same document.
 */
export async function openConversation(req: Request, res: Response) {
  const parsed = openConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }
  const { userId } = parsed.data;
  const me = req.auth!.sub;

  if (userId === me) {
    return res.status(400).json({ error: { message: "You can't message yourself" } });
  }
  if (!isValidObjectId(userId)) {
    return res.status(404).json({ error: { message: "User not found" } });
  }
  const other = await User.findById(userId);
  if (!other) {
    return res.status(404).json({ error: { message: "User not found" } });
  }

  const [userA, userB] = sortPair(me, userId);
  // Upsert: find the existing thread or create it in one atomic step.
  const doc = await Conversation.findOneAndUpdate(
    { userA, userB },
    { $setOnInsert: { userA, userB, lastMessageAt: new Date() } },
    { new: true, upsert: true }
  ).populate(withParticipants);

  return res.status(201).json({ data: { conversation: toConversationDto(doc, me, null, 0) } });
}

/** GET /api/messages/conversations — the caller's inbox, newest activity first. */
export async function listConversations(req: Request, res: Response) {
  const me = req.auth!.sub;
  const docs = await Conversation.find({ $or: [{ userA: me }, { userB: me }] })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .populate(withParticipants);

  // Preview + unread badge per thread. Fine at inbox sizes (≤100 threads).
  const shaped = await Promise.all(
    docs.map(async (doc) => {
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({ conversation: doc._id }).sort({ createdAt: -1 }),
        Message.countDocuments({ conversation: doc._id, sender: { $ne: me }, readAt: null }),
      ]);
      return toConversationDto(doc, me, lastMessage, unreadCount);
    })
  );

  return res.json({ data: { conversations: shaped } });
}

/**
 * GET /api/messages/conversations/:id — the thread's messages (oldest first).
 * Opening a thread is what "reads" it, so incoming messages get their readAt
 * stamped here.
 */
export async function getConversationMessages(req: Request, res: Response) {
  const doc = await findMyConversationOr404(req.params.id!, req, res);
  if (!doc) return;
  const me = req.auth!.sub;

  await Message.updateMany(
    { conversation: doc._id, sender: { $ne: me }, readAt: null },
    { readAt: new Date() }
  );

  const populated = await doc.populate(withParticipants);
  const a = populated.userA as unknown as ParticipantRef;
  const b = populated.userB as unknown as ParticipantRef;
  const nameById = new Map([
    [String(a._id), a.name],
    [String(b._id), b.name],
  ]);

  const messages = await Message.find({ conversation: doc._id }).sort({ createdAt: 1 }).limit(200);

  return res.json({
    data: {
      conversation: toConversationDto(populated, me, null, 0),
      messages: messages.map((m) => toChatMessage(m, nameById.get(String(m.sender)) ?? "Unknown")),
    },
  });
}

/** POST /api/messages/conversations/:id — send a message into the thread. */
export async function sendMessage(req: Request, res: Response) {
  const doc = await findMyConversationOr404(req.params.id!, req, res);
  if (!doc) return;

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        details: parsed.error.issues,
      },
    });
  }

  const created = await Message.create({
    conversation: doc._id,
    sender: req.auth!.sub,
    body: parsed.data.body,
  });

  doc.lastMessageAt = created.createdAt;
  await doc.save();

  const sender = await User.findById(req.auth!.sub).select("name");
  return res.status(201).json({ data: { message: toChatMessage(created, sender?.name ?? "You") } });
}

/** GET /api/messages/unread-count — total unread messages, for the nav badge. */
export async function getUnreadCount(req: Request, res: Response) {
  const me = req.auth!.sub;
  const conversations = await Conversation.find({ $or: [{ userA: me }, { userB: me }] }).select(
    "_id"
  );
  const count = await Message.countDocuments({
    conversation: { $in: conversations.map((c) => c._id) },
    sender: { $ne: me },
    readAt: null,
  });
  return res.json({ data: { count } });
}

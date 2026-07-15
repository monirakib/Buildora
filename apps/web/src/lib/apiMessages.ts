import type { ChatMessage, Conversation } from "@buildora/shared";
import { request } from "./api";

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** POST /api/messages/conversations — open (or reuse) the thread with a user. */
export async function openConversation(token: string, userId: string): Promise<Conversation> {
  const res = await request<{ data: { conversation: Conversation } }>(
    "/api/messages/conversations",
    { method: "POST", headers: authed(token), body: JSON.stringify({ userId }) }
  );
  return res.data.conversation;
}

/** GET /api/messages/conversations — the inbox, newest activity first. */
export async function listConversations(token: string): Promise<Conversation[]> {
  const res = await request<{ data: { conversations: Conversation[] } }>(
    "/api/messages/conversations",
    { headers: authed(token) }
  );
  return res.data.conversations;
}

/** GET /api/messages/conversations/:id — thread + messages (marks them read). */
export async function getConversationMessages(
  token: string,
  id: string
): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
  const res = await request<{
    data: { conversation: Conversation; messages: ChatMessage[] };
  }>(`/api/messages/conversations/${id}`, { headers: authed(token) });
  return res.data;
}

/** POST /api/messages/conversations/:id — send a message into the thread. */
export async function sendMessage(token: string, id: string, body: string): Promise<ChatMessage> {
  const res = await request<{ data: { message: ChatMessage } }>(
    `/api/messages/conversations/${id}`,
    { method: "POST", headers: authed(token), body: JSON.stringify({ body }) }
  );
  return res.data.message;
}

/** GET /api/messages/unread-count — total unread messages for the nav badge. */
export async function getUnreadCount(token: string): Promise<number> {
  const res = await request<{ data: { count: number } }>("/api/messages/unread-count", {
    headers: authed(token),
  });
  return res.data.count;
}

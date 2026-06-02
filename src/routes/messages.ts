import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";
import { InternalChannelAdapter } from "../lib/channels/internal";
import { EmailChannelAdapter } from "../lib/channels/email";
import { NotificationChannelAdapter } from "../lib/channels/notification";

const messages = new Hono<AppContext>();
messages.use("*", authMiddleware, workspaceMiddleware);

messages.get("/conversations/:conversationId/messages", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { page = "1", limit = "50" } = c.req.query();
  const p = Math.max(1, parseInt(page)), l = Math.min(100, parseInt(limit));
  const { data, count, error } = await sb.from("conversation_messages")
    .select("*", { count: "exact" })
    .eq("conversation_id", c.req.param("conversationId"))
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .range((p - 1) * l, p * l - 1);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ messages: data, total: count ?? 0, page: p, pages: Math.ceil((count ?? 0) / l) });
});

messages.post("/conversations/:conversationId/messages", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");

  const body = await c.req.json<{ content: string; content_type?: string; message_type?: string; is_internal_note?: boolean; mentioned_user_ids?: string[] }>();
  if (!body.content) return c.json({ error: "content is required" }, 400);

  // Fetch conversation to know channel
  const { data: conv } = await sb.from("conversations").select("channel,customer_id,assigned_to").eq("id", conversationId).eq("workspace_id", workspaceId).single();
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const id = crypto.randomUUID();
  const isNote = body.is_internal_note ?? false;
  const { data: msg, error } = await sb.from("conversation_messages").insert({
    id, conversation_id: conversationId, workspace_id: workspaceId,
    sender_id: user.id, content: body.content, content_type: body.content_type ?? "text",
    message_type: isNote ? "note" : (body.message_type ?? "outbound"),
    channel: isNote ? "internal" : conv.channel,
    is_internal_note: isNote, status: "sent",
    mentioned_user_ids: body.mentioned_user_ids ?? [],
  }).select().single();
  if (error) return c.json({ error: error.message }, 500);

  // Update conversation last_message_at + needs_response
  await sb.from("conversations").update({
    last_message_at: new Date().toISOString(),
    needs_response: false,
    first_response_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", conversationId).eq("workspace_id", workspaceId);

  // Deliver via channel adapter (only for non-internal notes)
  if (!isNote) {
    let adapter;
    const notifyUrl = "https://notification.rald.cloud";
    const token = c.req.header("Authorization")?.slice(7) ?? "";
    if (conv.channel === "email") adapter = new EmailChannelAdapter(notifyUrl, token, workspaceId);
    else if (conv.channel === "notification") adapter = new NotificationChannelAdapter(notifyUrl, token, workspaceId);
    else adapter = new InternalChannelAdapter();

    c.executionCtx.waitUntil(
      adapter.send({ conversationId, workspaceId, senderId: user.id, content: body.content, contentType: (body.content_type ?? "text") as "text" | "html" | "markdown" })
        .then(result => sb.from("conversation_messages").update({ delivery_status: result.success ? "delivered" : "failed", external_id: result.externalId }).eq("id", id))
    );
  }

  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "message.created", resourceType: "message", resourceId: id, status: "success", metadata: { conversationId, isNote } }));
  return c.json({ message: msg }, 201);
});

messages.delete("/conversations/:conversationId/messages/:messageId", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const { error } = await sb.from("conversation_messages").update({ deleted_at: new Date().toISOString() }).eq("id", c.req.param("messageId")).eq("workspace_id", workspaceId);
  if (error) return c.json({ error: error.message }, 500);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "message.deleted", resourceType: "message", resourceId: c.req.param("messageId"), status: "success" }));
  return c.json({ deleted: true });
});

export { messages };

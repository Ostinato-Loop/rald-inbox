import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";
import { computeSLADeadlines } from "../lib/sla";

const conversations = new Hono<AppContext>();
conversations.use("*", authMiddleware, workspaceMiddleware);

// List conversations with view filtering
conversations.get("/", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const { view = "all", status, priority, assigned_to, tag: _tag, page = "1", limit = "20" } = c.req.query();
  const p = Math.max(1, parseInt(page)), l = Math.min(100, parseInt(limit));

  let query = sb.from("conversations")
    .select("*, participants:conversation_participants(user_id,role), tags:conversation_tags(tag)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .range((p - 1) * l, p * l - 1);

  if (view === "mine") query = query.eq("assigned_to", user.id);
  if (view === "unassigned") query = query.is("assigned_to", null);
  if (view === "unread") query = query.gt("unread_count", 0);
  if (view === "priority") query = query.in("priority", ["urgent", "high"]);
  if (view === "needs_response") query = query.eq("needs_response", true);
  if (view === "resolved") query = query.eq("status", "resolved");
  if (view === "archived") query = query.eq("status", "archived");
  if (view === "spam") query = query.eq("status", "spam");
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (assigned_to) query = query.eq("assigned_to", assigned_to);

  const { data, count, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ conversations: data, total: count ?? 0, page: p, pages: Math.ceil((count ?? 0) / l) });
});

// Create conversation
conversations.post("/", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const body = await c.req.json<{
    subject: string; channel: string; customer_id?: string;
    priority?: string; initial_message?: string; tags?: string[];
  }>();
  if (!body.subject || !body.channel) return c.json({ error: "subject and channel are required" }, 400);

  const priority = body.priority ?? "normal";
  const sla = computeSLADeadlines(priority, new Date().toISOString());
  const id = crypto.randomUUID();

  const { data: conv, error } = await sb.from("conversations").insert({
    id, workspace_id: workspaceId, subject: body.subject, channel: body.channel,
    customer_id: body.customer_id ?? null, status: "open", priority,
    created_by: user.id, assigned_to: null, unread_count: body.initial_message ? 1 : 0,
    needs_response: !!body.initial_message, last_message_at: new Date().toISOString(),
    first_response_due_at: sla.first_response_due_at, resolution_due_at: sla.resolution_due_at,
  }).select().single();
  if (error) return c.json({ error: error.message }, 500);

  // Add initial message if provided
  if (body.initial_message) {
    await sb.from("conversation_messages").insert({
      id: crypto.randomUUID(), conversation_id: id, workspace_id: workspaceId,
      sender_id: user.id, content: body.initial_message, content_type: "text",
      message_type: "outbound", channel: body.channel, status: "sent",
    });
  }

  // Add tags
  if (body.tags?.length) {
    await sb.from("conversation_tags").insert(body.tags.map(t => ({ conversation_id: id, workspace_id: workspaceId, tag: t, created_by: user.id })));
  }

  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "conversation.created", resourceType: "conversation", resourceId: id, status: "success", metadata: { channel: body.channel, priority } }));
  return c.json({ conversation: conv }, 201);
});

// Get single conversation with full context
conversations.get("/:id", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { data, error } = await sb.from("conversations").select("*, participants:conversation_participants(*), tags:conversation_tags(*), sla:conversation_sla(*)").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).is("deleted_at", null).single();
  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json({ conversation: data });
});

// Update conversation (status, priority, subject, assigned_to)
conversations.patch("/:id", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ status?: string; priority?: string; subject?: string; assigned_to?: string | null; needs_response?: boolean }>();

  const { data: existing } = await sb.from("conversations").select("status,priority,assigned_to").eq("id", id).eq("workspace_id", workspaceId).single();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) { updates.status = body.status; if (body.status === "resolved") updates.resolved_at = new Date().toISOString(); }
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
  if (body.needs_response !== undefined) updates.needs_response = body.needs_response;

  const { data, error } = await sb.from("conversations").update(updates).eq("id", id).eq("workspace_id", workspaceId).select().single();
  if (error) return c.json({ error: error.message }, 500);

  let action: "conversation.status_changed" | "conversation.priority_changed" | "conversation.assigned" | "conversation.updated" = "conversation.updated";
  if (body.status) action = "conversation.status_changed";
  else if (body.priority) action = "conversation.priority_changed";
  else if (body.assigned_to !== undefined) action = "conversation.assigned";
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action, resourceType: "conversation", resourceId: id, status: "success", metadata: { changes: body, previous: existing } }));
  return c.json({ conversation: data });
});

// Soft delete
conversations.delete("/:id", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const { error } = await sb.from("conversations").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return c.json({ error: error.message }, 500);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "conversation.deleted", resourceType: "conversation", resourceId: id, status: "success" }));
  return c.json({ deleted: true });
});

export { conversations };

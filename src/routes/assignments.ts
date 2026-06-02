import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const assignments = new Hono<AppContext>();
assignments.use("*", authMiddleware, workspaceMiddleware);

assignments.post("/conversations/:id/assign", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const { assigned_to, reason } = await c.req.json<{ assigned_to: string; reason?: string }>();
  if (!assigned_to) return c.json({ error: "assigned_to is required" }, 400);

  const { data: prev } = await sb.from("conversations").select("assigned_to").eq("id", id).eq("workspace_id", workspaceId).single();
  const isReassign = !!prev?.assigned_to && prev.assigned_to !== assigned_to;

  await sb.from("conversations").update({ assigned_to, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  await sb.from("conversation_assignments").insert({ id: crypto.randomUUID(), conversation_id: id, workspace_id: workspaceId, assigned_to, assigned_by: user.id, reason: reason ?? null });

  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: isReassign ? "conversation.reassigned" : "conversation.assigned", resourceType: "conversation", resourceId: id, status: "success", metadata: { assigned_to, previous_assignee: prev?.assigned_to, reason } }));
  return c.json({ assigned: true, assigned_to });
});

assignments.delete("/conversations/:id/assign", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  await sb.from("conversations").update({ assigned_to: null, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "assignment.removed", resourceType: "conversation", resourceId: id, status: "success" }));
  return c.json({ unassigned: true });
});

assignments.get("/conversations/:id/assignments", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { data, error } = await sb.from("conversation_assignments").select("*").eq("conversation_id", c.req.param("id")).eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ assignments: data });
});

export { assignments };

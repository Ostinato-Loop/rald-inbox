import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { computeSLAStatus } from "../lib/sla";

const sla = new Hono<AppContext>();
sla.use("*", authMiddleware, workspaceMiddleware);

sla.get("/conversations/:id/sla", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { data, error } = await sb.from("conversations").select("priority,status,first_response_due_at,resolution_due_at,first_response_at,resolved_at").eq("id", c.req.param("id")).eq("workspace_id", workspaceId).single();
  if (error || !data) return c.json({ error: "Not found" }, 404);
  const slaStatus = computeSLAStatus({ first_response_due_at: data.first_response_due_at, resolution_due_at: data.resolution_due_at, first_response_at: data.first_response_at, resolved_at: data.resolved_at });
  return c.json({ sla: { ...data, sla_status: slaStatus } });
});

// Cron handler: check breached/warning SLAs across all workspaces
export async function processSLAAlerts(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();
  // Find breached: open conversations where resolution_due_at < now
  const { data: breached } = await sb.from("conversations").select("id,workspace_id,priority,assigned_to").eq("status", "open").lt("resolution_due_at", now).is("deleted_at", null).limit(100);
  for (const conv of breached ?? []) {
    await sb.from("inbox_audit_log").insert({ id: crypto.randomUUID(), workspace_id: conv.workspace_id, user_id: "system", action: "sla.breach", resource_type: "conversation", resource_id: conv.id, status: "success", metadata: { priority: conv.priority, assigned_to: conv.assigned_to }, created_at: now });
  }
  return { breached: (breached ?? []).length };
}

export { sla };

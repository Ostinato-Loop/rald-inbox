import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";

const analytics = new Hono<AppContext>();
analytics.use("*", authMiddleware, workspaceMiddleware);

analytics.get("/analytics/overview", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { from = new Date(Date.now() - 7 * 86400_000).toISOString(), to = new Date().toISOString() } = c.req.query();

  const [open, resolved, unassigned, overdue] = await Promise.all([
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open").is("deleted_at", null),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "resolved").gte("resolved_at", from).lte("resolved_at", to),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open").is("assigned_to", null).is("deleted_at", null),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open").lt("resolution_due_at", new Date().toISOString()).is("deleted_at", null),
  ]);

  const { data: byChannel } = await sb.from("conversations").select("channel").eq("workspace_id", workspaceId).gte("created_at", from).lte("created_at", to).is("deleted_at", null);
  const channelDist: Record<string, number> = {};
  for (const r of byChannel ?? []) channelDist[r.channel] = (channelDist[r.channel] ?? 0) + 1;

  return c.json({
    period: { from, to },
    open: open.count ?? 0,
    resolved: resolved.count ?? 0,
    unassigned: unassigned.count ?? 0,
    overdue_sla: overdue.count ?? 0,
    channel_distribution: channelDist,
  });
});

analytics.get("/analytics/agent", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { from = new Date(Date.now() - 7 * 86400_000).toISOString(), to = new Date().toISOString() } = c.req.query();
  const { data } = await sb.from("conversations").select("assigned_to,status").eq("workspace_id", workspaceId).gte("created_at", from).lte("created_at", to).is("deleted_at", null);
  const agentStats: Record<string, { total: number; resolved: number }> = {};
  for (const r of data ?? []) {
    const a = r.assigned_to ?? "unassigned";
    if (!agentStats[a]) agentStats[a] = { total: 0, resolved: 0 };
    agentStats[a].total++;
    if (r.status === "resolved") agentStats[a].resolved++;
  }
  return c.json({ period: { from, to }, agents: agentStats });
});

export { analytics };

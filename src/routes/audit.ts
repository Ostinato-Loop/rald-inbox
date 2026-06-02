import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware, adminMiddleware } from "../lib/middleware";

const auditRoute = new Hono<AppContext>();
auditRoute.use("*", authMiddleware, workspaceMiddleware, adminMiddleware);

auditRoute.get("/audit", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const { resource_id, action, page = "1", limit = "50" } = c.req.query();
  const p = Math.max(1, parseInt(page)), l = Math.min(100, parseInt(limit));
  let query = sb.from("inbox_audit_log").select("*", { count: "exact" }).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range((p - 1) * l, p * l - 1);
  if (resource_id) query = query.eq("resource_id", resource_id);
  if (action) query = query.eq("action", action);
  const { data, count, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ audit_log: data, total: count ?? 0, page: p, pages: Math.ceil((count ?? 0) / l) });
});

export { auditRoute };

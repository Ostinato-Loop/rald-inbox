import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const views = new Hono<AppContext>();
views.use("*", authMiddleware, workspaceMiddleware);

views.get("/views", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const { data, error } = await sb.from("inbox_saved_views").select("*")
    .eq("workspace_id", workspaceId)
    .or(`is_shared.eq.true,created_by.eq.${user.id}`)
    .is("deleted_at", null).order("sort_order", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ views: data });
});

views.post("/views", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const body = await c.req.json<{ name: string; filters: Record<string, unknown>; is_shared?: boolean; sort_order?: number }>();
  if (!body.name || !body.filters) return c.json({ error: "name and filters are required" }, 400);
  const id = crypto.randomUUID();
  const { data, error } = await sb.from("inbox_saved_views").insert({ id, workspace_id: workspaceId, name: body.name, filters: body.filters, is_shared: body.is_shared ?? false, sort_order: body.sort_order ?? 999, created_by: user.id }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "view.created", resourceType: "view", resourceId: id, status: "success" }));
  return c.json({ view: data }, 201);
});

views.patch("/views/:id", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; filters?: Record<string, unknown>; is_shared?: boolean; sort_order?: number }>();
  const { data, error } = await sb.from("inbox_saved_views").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId).eq("created_by", user.id).select().single();
  if (error) return c.json({ error: error.message }, 500);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "view.updated", resourceType: "view", resourceId: id, status: "success" }));
  return c.json({ view: data });
});

views.delete("/views/:id", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  await sb.from("inbox_saved_views").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspaceId).eq("created_by", user.id);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "view.deleted", resourceType: "view", resourceId: id, status: "success" }));
  return c.json({ deleted: true });
});

export { views };

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { AppContext, authMiddleware, workspaceMiddleware } from "../lib/middleware";
import { writeAuditLog } from "../lib/audit";

const tags = new Hono<AppContext>();
tags.use("*", authMiddleware, workspaceMiddleware);

tags.get("/conversations/:id/tags", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await sb.from("conversation_tags").select("*").eq("conversation_id", c.req.param("id")).eq("workspace_id", c.get("workspaceId"));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ tags: data });
});

tags.post("/conversations/:id/tags", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const { tag } = await c.req.json<{ tag: string }>();
  if (!tag) return c.json({ error: "tag is required" }, 400);
  const { data, error } = await sb.from("conversation_tags").insert({ id: crypto.randomUUID(), conversation_id: id, workspace_id: workspaceId, tag, created_by: user.id }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "tag.added", resourceType: "conversation", resourceId: id, status: "success", metadata: { tag } }));
  return c.json({ tag: data }, 201);
});

tags.delete("/conversations/:id/tags/:tag", async (c) => {
  const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const workspaceId = c.get("workspaceId");
  const user = c.get("user");
  const id = c.req.param("id");
  const tag = c.req.param("tag");
  await sb.from("conversation_tags").delete().eq("conversation_id", id).eq("workspace_id", workspaceId).eq("tag", tag);
  c.executionCtx.waitUntil(writeAuditLog(sb, { workspaceId, userId: user.id, action: "tag.removed", resourceType: "conversation", resourceId: id, status: "success", metadata: { tag } }));
  return c.json({ deleted: true });
});

export { tags };

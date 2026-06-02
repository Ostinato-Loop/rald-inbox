import { Context, Next } from "hono";
import { verifyJwt, JWTPayload } from "./auth";

export type AppContext = {
  Variables: {
    user: JWTPayload;
    workspaceId: string;
  };
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    RALD_JWT_SECRET: string;
    RATE_LIMIT_KV: KVNamespace;
  };
};

export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const payload = await verifyJwt(token, c.env.RALD_JWT_SECRET);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", payload);
  await next();
}

export async function workspaceMiddleware(c: Context<AppContext>, next: Next) {
  const workspaceId = c.req.header("X-Workspace-ID");
  if (!workspaceId) return c.json({ error: "X-Workspace-ID header required" }, 400);
  c.set("workspaceId", workspaceId);
  await next();
}

export async function adminMiddleware(c: Context<AppContext>, next: Next) {
  const user = c.get("user");
  if (!["admin", "operator"].includes(user.role)) return c.json({ error: "Forbidden" }, 403);
  await next();
}

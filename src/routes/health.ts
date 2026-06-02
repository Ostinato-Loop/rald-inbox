import { Hono } from "hono";
import { AppContext } from "../lib/middleware";
import { createClient } from "@supabase/supabase-js";

const health = new Hono<AppContext>();

health.get("/healthz", (c) => c.json({ status: "ok", service: "rald-inbox", timestamp: new Date().toISOString() }));

health.get("/readyz", async (c) => {
  const checks: Record<string, string> = {};
  try {
    const sb = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await sb.from("conversations").select("id").limit(1);
    checks.supabase = error ? "fail" : "ok";
  } catch { checks.supabase = "fail"; }
  checks.jwt_secret = c.env.RALD_JWT_SECRET ? "ok" : "missing";
  const ok = Object.values(checks).every(v => v === "ok");
  return c.json({ status: ok ? "ready" : "degraded", checks }, ok ? 200 : 503);
});

export { health };

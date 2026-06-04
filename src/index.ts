import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppContext } from "./lib/middleware";
import { health } from "./routes/health";
import { conversations } from "./routes/conversations";
import { messages } from "./routes/messages";
import { assignments } from "./routes/assignments";
import { tags } from "./routes/tags";
import { views } from "./routes/views";
import { sla, processSLAAlerts } from "./routes/sla";
import { analytics } from "./routes/analytics";
import { auditRoute } from "./routes/audit";

const app = new Hono<AppContext>();

app.use("*", cors({
  origin: ["https://loop-business.rald.cloud", "https://app.rald.cloud", "https://rald.cloud"],
  allowHeaders: ["Authorization", "Content-Type", "X-Workspace-ID"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));

// Health
app.route("/", health);

// Conversations
app.route("/api", conversations);

// Messages & Notes
app.route("/api", messages);

// Assignments
app.route("/api", assignments);

// Tags
app.route("/api", tags);

// Saved Views
app.route("/api", views);

// SLA
app.route("/api", sla);

// Analytics
app.route("/api", analytics);

// Audit Log
app.route("/api", auditRoute);

// 404
app.notFound((c) => c.json({ error: "Not found", service: "rald-inbox" }, 404));

export default {
  async fetch(req: Request, env: AppContext["Bindings"], ctx: ExecutionContext): Promise<Response> {
    // ── FAIL FAST — service must not start with missing secrets ──────────
    const missing: string[] = [];
    if (!env.RALD_JWT_SECRET)           missing.push('RALD_JWT_SECRET');
    if (!env.SUPABASE_URL)              missing.push('SUPABASE_URL');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) {
      console.error(`[FATAL] rald-inbox: missing required secrets: ${missing.join(', ')}`);
      return new Response(JSON.stringify({ error: 'Service misconfigured', missing, service: 'rald-inbox' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    return app.fetch(req, env, ctx);
  },

  // Cloudflare Cron Trigger — SLA monitoring every 10 minutes
  async scheduled(_event: ScheduledEvent, env: AppContext["Bindings"], ctx: ExecutionContext) {
    ctx.waitUntil(processSLAAlerts(env).then(r => console.log("[cron] SLA alerts:", r)));
  },
};

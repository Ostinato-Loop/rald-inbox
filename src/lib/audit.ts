import { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "conversation.created" | "conversation.updated" | "conversation.deleted"
  | "conversation.assigned" | "conversation.reassigned" | "conversation.resolved"
  | "conversation.reopened" | "conversation.archived" | "conversation.spam"
  | "conversation.priority_changed" | "conversation.status_changed"
  | "message.created" | "message.deleted"
  | "note.created" | "note.updated" | "note.deleted"
  | "tag.added" | "tag.removed"
  | "assignment.created" | "assignment.removed"
  | "sla.breach" | "sla.warning" | "sla.resolved"
  | "view.created" | "view.updated" | "view.deleted";

export async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    status: "success" | "failure";
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  try {
    await supabase.from("inbox_audit_log").insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      status: params.status,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[audit] write failed:", String(e));
  }
}

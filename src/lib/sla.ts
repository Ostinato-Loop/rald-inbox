export interface SLAConfig {
  priority: "urgent" | "high" | "normal" | "low";
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export const DEFAULT_SLA: Record<string, SLAConfig> = {
  urgent: { priority: "urgent", firstResponseMinutes: 30, resolutionMinutes: 240 },
  high:   { priority: "high",   firstResponseMinutes: 60, resolutionMinutes: 480 },
  normal: { priority: "normal", firstResponseMinutes: 240, resolutionMinutes: 1440 },
  low:    { priority: "low",    firstResponseMinutes: 480, resolutionMinutes: 4320 },
};

export function computeSLADeadlines(priority: string, createdAt: string) {
  const sla = DEFAULT_SLA[priority] ?? DEFAULT_SLA.normal;
  const created = new Date(createdAt).getTime();
  return {
    first_response_due_at: new Date(created + sla.firstResponseMinutes * 60_000).toISOString(),
    resolution_due_at: new Date(created + sla.resolutionMinutes * 60_000).toISOString(),
  };
}

export function computeSLAStatus(deadlines: { first_response_due_at: string | null; resolution_due_at: string | null; first_response_at: string | null; resolved_at: string | null }) {
  const now = new Date();
  if (deadlines.resolved_at) return "met";
  if (deadlines.resolution_due_at && now > new Date(deadlines.resolution_due_at)) return "breached";
  if (deadlines.resolution_due_at) {
    const minutesLeft = (new Date(deadlines.resolution_due_at).getTime() - now.getTime()) / 60_000;
    if (minutesLeft <= 60) return "warning";
  }
  return "on_track";
}

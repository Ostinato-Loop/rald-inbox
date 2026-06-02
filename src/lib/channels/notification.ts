import { ChannelAdapter, ChannelMessage, ChannelDeliveryResult } from "./interface";

export class NotificationChannelAdapter implements ChannelAdapter {
  channel = "notification";
  private notifyUrl: string;
  private jwtToken: string;
  private workspaceId: string;

  constructor(notifyUrl: string, jwtToken: string, workspaceId: string) {
    this.notifyUrl = notifyUrl;
    this.jwtToken = jwtToken;
    this.workspaceId = workspaceId;
  }

  canHandle(ch: string) { return ch === "notification"; }

  async send(message: ChannelMessage): Promise<ChannelDeliveryResult> {
    try {
      const res = await fetch(`${this.notifyUrl}/api/notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.jwtToken}`,
          "X-Workspace-ID": this.workspaceId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channels: ["push", "email"],
          content: { title: "New message", body: message.content.slice(0, 140) },
          metadata: { conversation_id: message.conversationId, source: "inbox" },
        }),
      });
      if (!res.ok) return { success: false, errorMessage: `notify error: ${res.status}`, provider: "rald-notify/push" };
      const data = await res.json() as { notification: { id: string } };
      return { success: true, externalId: data.notification?.id, provider: "rald-notify/push" };
    } catch (e) {
      return { success: false, errorMessage: String(e), provider: "rald-notify/push" };
    }
  }
}

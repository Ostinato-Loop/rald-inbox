import { ChannelAdapter, ChannelMessage, ChannelDeliveryResult } from "./interface";

export class EmailChannelAdapter implements ChannelAdapter {
  channel = "email";
  private notifyUrl: string;
  private jwtToken: string;
  private workspaceId: string;

  constructor(notifyUrl: string, jwtToken: string, workspaceId: string) {
    this.notifyUrl = notifyUrl;
    this.jwtToken = jwtToken;
    this.workspaceId = workspaceId;
  }

  canHandle(ch: string) { return ch === "email"; }

  async send(message: ChannelMessage): Promise<ChannelDeliveryResult> {
    // Email delivery via rald-notify — no direct Resend calls from Inbox
    try {
      const res = await fetch(`${this.notifyUrl}/api/notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.jwtToken}`,
          "X-Workspace-ID": this.workspaceId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channels: ["email"],
          content: { subject: "Re: Your conversation", body: message.content },
          metadata: { conversation_id: message.conversationId, source: "inbox" },
        }),
      });
      if (!res.ok) return { success: false, errorMessage: `notify error: ${res.status}`, provider: "rald-notify/email" };
      const data = await res.json() as { notification: { id: string } };
      return { success: true, externalId: data.notification?.id, provider: "rald-notify/email" };
    } catch (e) {
      return { success: false, errorMessage: String(e), provider: "rald-notify/email" };
    }
  }
}

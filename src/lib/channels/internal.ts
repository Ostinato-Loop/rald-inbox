import { ChannelAdapter, ChannelMessage, ChannelDeliveryResult } from "./interface";

export class InternalChannelAdapter implements ChannelAdapter {
  channel = "internal";
  canHandle(ch: string) { return ch === "internal"; }

  async send(message: ChannelMessage): Promise<ChannelDeliveryResult> {
    // Internal messages are stored directly in the DB — no external delivery needed
    return { success: true, externalId: `internal:${message.conversationId}`, provider: "internal" };
  }
}

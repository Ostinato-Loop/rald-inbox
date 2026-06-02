export interface ChannelMessage {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  content: string;
  contentType: "text" | "html" | "markdown";
  attachments?: Array<{ url: string; name: string; mimeType: string; size: number }>;
  metadata?: Record<string, unknown>;
}

export interface ChannelDeliveryResult {
  success: boolean;
  externalId?: string;
  errorMessage?: string;
  provider: string;
}

export interface ChannelAdapter {
  channel: string;
  send(message: ChannelMessage): Promise<ChannelDeliveryResult>;
  canHandle(channel: string): boolean;
}

// Future adapters: loop_messenger, whatsapp, instagram, facebook, web_chat, sms
// All implement ChannelAdapter interface with zero inbox-side code changes
export const FUTURE_CHANNELS = ["loop_messenger", "whatsapp", "instagram", "facebook", "web_chat", "sms"] as const;

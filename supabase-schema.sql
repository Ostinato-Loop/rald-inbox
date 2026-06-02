-- RALD Unified Inbox Schema
-- inbox.rald.cloud — Phase F
-- Run in Supabase SQL editor

-- 1. Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  workspace_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('internal','email','notification','loop_messenger','whatsapp','instagram','facebook','web_chat','sms')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','archived','spam')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  customer_id TEXT,
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  needs_response BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  first_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(workspace_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(workspace_id, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_sla ON conversations(workspace_id, resolution_due_at) WHERE status='open' AND deleted_at IS NULL;

-- 2. Conversation Messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','html','markdown')),
  message_type TEXT NOT NULL DEFAULT 'outbound' CHECK (message_type IN ('inbound','outbound','note','system')),
  channel TEXT NOT NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending','sent','delivered','failed','read')),
  delivery_status TEXT,
  external_id TEXT,
  mentioned_user_ids TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at ASC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON conversation_messages(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender ON conversation_messages(sender_id);

-- 3. Conversation Participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('owner','agent','participant','observer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);

-- 4. Conversation Tags
CREATE TABLE IF NOT EXISTS conversation_tags (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tags_workspace_tag ON conversation_tags(workspace_id, tag);

-- 5. Conversation Assignments
CREATE TABLE IF NOT EXISTS conversation_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assignments_conversation ON conversation_assignments(conversation_id, created_at DESC);

-- 6. Inbox Saved Views
CREATE TABLE IF NOT EXISTS inbox_saved_views (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 999,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_views_workspace ON inbox_saved_views(workspace_id, sort_order) WHERE deleted_at IS NULL;

-- 7. Inbox Audit Log
CREATE TABLE IF NOT EXISTS inbox_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbox_audit_workspace ON inbox_audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_audit_resource ON inbox_audit_log(resource_id, created_at DESC);

-- 8. Conversation SLA (denormalized for quick queries)
CREATE TABLE IF NOT EXISTS conversation_sla (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  priority TEXT NOT NULL,
  first_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  first_response_met BOOLEAN,
  resolution_met BOOLEAN,
  sla_status TEXT NOT NULL DEFAULT 'on_track' CHECK (sla_status IN ('on_track','warning','breached','met')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sla_workspace ON conversation_sla(workspace_id, sla_status);
CREATE INDEX IF NOT EXISTS idx_sla_due ON conversation_sla(resolution_due_at) WHERE sla_status != 'met';

-- 9. Channel Adapters Registry (future extensibility)
CREATE TABLE IF NOT EXISTS inbox_channel_registry (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, channel)
);

-- 10. Search vector for conversations (integrates with rald-search)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(subject, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_conversations_fts ON conversations USING GIN(search_vector);

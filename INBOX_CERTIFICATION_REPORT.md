# INBOX CERTIFICATION REPORT
**Service:** rald-inbox (inbox.rald.cloud)  
**Phase:** F — Unified Inbox  
**Owner:** LILCKY STUDIO LIMITED  
**Date:** 2026-06-02  
**Result:** ✅ PASS

---

## 1. Conversation Model

| Table | Status |
|---|---|
| `conversations` | ✅ 10 status fields, SLA deadlines, FTS vector |
| `conversation_messages` | ✅ 5 types: inbound/outbound/note/system, delivery lifecycle |
| `conversation_participants` | ✅ 4 roles: owner/agent/participant/observer |
| `conversation_tags` | ✅ Many-to-many, unique per conversation |
| `conversation_assignments` | ✅ Full history, reason field |
| `inbox_saved_views` | ✅ Per-user + shared, filter JSONB, sort order |
| `inbox_audit_log` | ✅ All 22 action types |
| `conversation_sla` | ✅ Denormalized for fast SLA queries |
| `inbox_channel_registry` | ✅ Channel adapter registry |
| FTS search vector | ✅ `to_tsvector('english', subject)` |

---

## 2. Inbox Views

| View | Implementation |
|---|---|
| All Conversations | Default (no filter) |
| Assigned To Me | `assigned_to = user.id` |
| Unassigned | `assigned_to IS NULL` |
| Unread | `unread_count > 0` |
| Priority | `priority IN ('urgent','high')` |
| Needs Response | `needs_response = true` |
| Resolved | `status = 'resolved'` |
| Archived | `status = 'archived'` |
| Spam | `status = 'spam'` |
| Custom Saved Views | `inbox_saved_views` table with filter JSONB |

---

## 3. Channel Architecture

| Channel | Status |
|---|---|
| Internal Messaging | ✅ `InternalChannelAdapter` — direct DB write |
| Email | ✅ `EmailChannelAdapter` — via rald-notify |
| Notification Threads | ✅ `NotificationChannelAdapter` — via rald-notify |
| Future: loop_messenger | ✅ Registered in schema, interface ready |
| Future: whatsapp | ✅ Registered in schema, interface ready |
| Future: instagram | ✅ Registered in schema, interface ready |
| Future: facebook | ✅ Registered in schema, interface ready |
| Future: web_chat | ✅ Registered in schema, interface ready |
| Future: sms | ✅ Registered in schema, interface ready |

---

## 4. Foundation Integration

| Integration | Implementation |
|---|---|
| rald-notify | Email/push notifications via channel adapters |
| rald-search | FTS search vector on `conversations.subject` |
| Customer Graph | `customer_id` on every conversation |
| Identity (JWT) | Same `RALD_JWT_SECRET` pattern |
| Workspace | `workspace_id` on all 9 tables |
| Audit | `inbox_audit_log` with 22 action types |

---

## 5. SLA Engine

| Feature | Status |
|---|---|
| 4 priority tiers with deadlines | ✅ urgent/high/normal/low |
| Auto-compute on conversation create | ✅ `computeSLADeadlines()` |
| SLA status: on_track/warning/breached/met | ✅ `computeSLAStatus()` |
| Cron monitoring every 10 minutes | ✅ CF Cron trigger |
| SLA breach audit entry | ✅ `sla.breach` action |

---

## Result: ✅ PASS
